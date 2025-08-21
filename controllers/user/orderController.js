const Order = require("../../models/orderSchema");
const Cart = require("../../models/cartSchema");
const Address = require("../../models/addressSchema");
const User = require("../../models/userSchema");
const Variant = require("../../models/variantSchema");
const PDFDocument = require("pdfkit");






const placeOrder = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.user;
    const { addressId, paymentMethod } = req.body;

    // 1. Get cart
    const cart = await Cart.findOne({ userId })
      .populate("items.productId")
      .populate("items.variantId");

    if (!cart || cart.items.length === 0) {
      return res.json({ success: false, message: "Cart is empty" });
    }

    // 2. Get address snapshot
    const addressDoc = await Address.findOne({ userId });
    const address = addressDoc.addresses.id(addressId); // subdoc by ID

    if (!address) {
      return res.json({ success: false, message: "Address not found" });
    }

    // 3. Prepare items with basePrice & salePrice snapshot
    let totalPrice = 0, discount = 0;
    const orderedItems = cart.items.map(item => {
      const basePrice = item.variantId?.basePrice || item.productId?.basePrice || 0;
      const salePrice = item.variantId?.salePrice || item.productId?.salePrice || basePrice;
      const quantity = item.quantity;

      // Snapshots
      productName = item.productId.productName;
      image = Array.isArray(item.variantId?.productImage)
        ? item.variantId.productImage[0]
        : (item.variantId?.productImage || item.productId.productImage[0])
      size = item.variantId?.size;
      color = item.variantId?.colour;

      const itemTotal = salePrice * quantity;

      totalPrice += basePrice * quantity;
      if (basePrice > salePrice) {
        discount += (basePrice - salePrice) * quantity;
      }

      return {
        product: item.productId._id,
        variant: item.variantId?._id || null,
        quantity,
        basePrice,
        salePrice,
        productName,
        image,
        size,
        color,
        total: itemTotal,
        status:"Ordered"
      };
    });

    const platformFee = 10;
    const shippingFee = totalPrice > 599 ? 0 : 30;
    const finalAmount = totalPrice - discount + platformFee + shippingFee;

    // 4. Save order
    const newOrder = new Order({
      user: userId,
      orderedItems,
      totalPrice,
      discount,
      finalAmount,
      shippingAddress: {
        name: address.name,
        phone: address.phone,
        landmark: address.landmark,
        city: address.city,
        state: address.state,
        pincode: address.pincode,
      }, // store snapshot instead of just ObjectId
      status: "Pending",
      couponApplied: false,
      invoiceDate: new Date(),
      platformFee,
      shippingFee,
      paymentMethod,
      paymentStatus: paymentMethod === "COD" ? "Pending" : "Paid"
    });

    await newOrder.save();


    // 5. Decrease stock for each ordered variant
    for (const item of orderedItems) {
      if (item.variant) {
        await Variant.findByIdAndUpdate(
          item.variant,
          { $inc: { stock: -item.quantity } }  // ✅ Decrease stock
        );
      }
    }


    // 6. Clear cart
    await Cart.updateOne({ userId }, { $set: { items: [] } });

    res.locals.cartCount = 0;


    res.json({ success: true, orderId: newOrder.orderId });

  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "Server error" });
  }
};

/////////////////////////////////////////////////////////////////////////////////////////


const loadOrderPlaced = async (req, res) => {
  try {

    let user = null;
    if (req.user) {
      user = req.user;
    } else if (req.session.user) {
      user = await User.findById(req.session.user);
    }

    res.locals.user = user;

    // const order = await Order.findById(req.params.id);
    res.render("orderPlaced");

  } catch (error) {
    console.error(error);
  }
}


//////////////////////////////////////////////////////////////////////////////////////////////

const getOrders = async (req, res) => {
  try {

    let user = null;
    if (req.user) {
      user = req.user;
    } else if (req.session.user) {
      user = await User.findById(req.session.user);
    }

    res.locals.user = user;

    const userId = req.user ? req.user._id : req.session.user;

    const { search } = req.query;

    let filter = { user: userId };

    if (search && search.trim() !== "") {
      const regex = new RegExp(search, "i");

      filter.$or = [
        { orderId: regex },                         // orderId search
        { "orderedItems.productName": regex },      // product name
        { "orderedItems.size": regex },             // size
      ];

      // If search is numeric → check against price fields also
      if (!isNaN(search)) {
        const numSearch = Number(search);
        filter.$or.push({ "orderedItems.salePrice": numSearch });
        filter.$or.push({ "orderedItems.total": numSearch });
        filter.$or.push({ finalAmount: numSearch });
      }
    }


    const orders = await Order.find({ user: userId })
      .populate("orderedItems.product")
      .populate("orderedItems.variant")
      .sort({ createdAt: -1 }); // latest first

    res.render("orders", {
      orders,
      query: req.query
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};


////////////////////////////////////////////////////////////////////////////////////////////


// GET order detail page
const getOrderDetail = async (req, res) => {
  try {

    let user = null;
    if (req.user) {
      user = req.user;
    } else if (req.session.user) {
      user = await User.findById(req.session.user);
    }

    res.locals.user = user;

    const orderId = req.params.id; // passed in route /order/:id

    // Find order by ID & populate product details if needed
    const order = await Order.findById(orderId)
      .populate({
        path: "orderedItems.product",
        select: "productName images status", // get product name + images
      })
      .lean();

    if (!order) {
      console.log("No order detail:");

    }

    res.render("order-detail", { order });
  } catch (err) {
    console.error("Error loading order detail:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

/////////////////////////////////////////////////////////////////////////////////////////////


const cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const order = await Order.findById(id);
    if (!order) return res.json({ success: false, message: "Order not found" });

    // ✅ Cancel all items & restore stock
    for (let item of order.orderedItems) {
      if (!["Shipped", "Out for Delivery", "Delivered"].includes(item.status)) {
        item.status = "Cancelled";
        item.cancelReason = reason || "Order cancelled";

        await Variant.findByIdAndUpdate(
          item.variant,
          { $inc: { stock: item.quantity } }
        );
      }
    }

    order.status = "Cancelled";
    order.cancelReason = reason || "Order cancelled";
    order.cancelledAt = new Date();

    await order.save();

    res.json({ success: true, message: "Order cancelled successfully" });
  } catch (error) {
    console.error(error);
    res.json({ success: false, message: "Server error" });
  }
};


////////////////////////////////////////////////////////////////////////////////////////////

// Cancel single item
const cancelItem = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { reason } = req.body;

    const order = await Order.findById(orderId);
    if (!order) return res.json({ success: false, message: "Order not found" });

    const item = order.orderedItems.id(itemId);
    if (!item) return res.json({ success: false, message: "Item not found" });

    if (item.status.toLowerCase() === "shipped") {
      return res.json({ success: false, message: "Cannot cancel shipped item" });
    }

    // Update status & reason
    item.status = "Cancelled";
    item.cancelReason = reason;

    await Variant.findByIdAndUpdate(
      item.variant, // correct field from schema
      { $inc: { stock: item.quantity } }
    );


    await order.save();

    res.json({ success: true, message: "Item cancelled successfully" });
  } catch (error) {
    console.error(error);
    res.json({ success: false, message: "Server error" });
  }
};


////////////////////////////////////////////////////////////////////////////////////////////

const downloadInvoice = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId)
      .populate("user", "name email");

    if (!order) return res.status(404).send("Order not found");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=invoice-${order.orderId}.pdf`
    );

    const doc = new PDFDocument();
    doc.pipe(res);

    // ===== Invoice Content =====
    doc.fontSize(20).text("KIDOOZA Boys Fashion", { align: "center" }).moveDown();
    doc.fontSize(16).text("INVOICE", { align: "center" }).moveDown();

    // Customer & Order Info
    doc.fontSize(12).text(`Order ID: ${order.orderId}`);
    doc.text(`Date: ${order.createdAt.toDateString()}`);
    doc.text(`Customer: ${order.shippingAddress.name}`);
    doc.text(`Email: ${order.user.email}`);
    doc.text(`Phone: ${order.shippingAddress.phone}`);
    doc.moveDown();

    // Items
    doc.fontSize(14).text("Ordered Items:", { underline: true }).moveDown();
    order.orderedItems.forEach((item, idx) => {
      doc.fontSize(12).text(
        `${idx + 1}. ${item.productName} (${item.size || "-"}, ${item.color || "-"}) - Qty: ${item.quantity} x ₹${item.salePrice} = ₹${item.total}`
      );
    });
    doc.moveDown();

    // Summary
    doc.text(`Subtotal: ₹${order.totalPrice}`);
    doc.text(`Discount: -₹${order.discount}`);
    doc.text(`Platform Fee: -₹${order.platformFee}`);
    doc.text(`Shipping Fee: -₹${order.shippingFee}`);
    doc.text(`Final Amount: ₹${order.finalAmount}`);
    doc.text(`Payment Method: ${order.paymentMethod}`);
    doc.text(`Payment Status: ${order.paymentStatus}`);
    doc.moveDown();

    doc.text("Thank you for shopping with us!", { align: "center" });

    // Send PDF
    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send("Error generating invoice");
  }
};

///////////////////////////////////////////////////////////////////////////////////////

const returnItem = async (req, res) => {
  try {
      const { orderId, itemId } = req.params;
      const { reason } = req.body;

      const order = await Order.findById(orderId);
      if (!order) return res.json({ success: false, message: "Order not found" });

      const item = order.orderedItems.id(itemId);
      if (!item) return res.json({ success: false, message: "Item not found" });

      if (item.status !== "Deliverd") {
          return res.json({ success: false, message: "Return not available for this item" });
      }

      item.status = "Return Requested";
      item.returnReason = reason;

      await order.save();

      res.json({ success: true });
  } catch (err) {
      console.error(err);
      res.json({ success: false, message: "Server error" });
  }
};

//////////////////////////////////////////////////////////////////////////////////////////



module.exports = {
  placeOrder,
  loadOrderPlaced,
  getOrders,
  getOrderDetail,
  cancelOrder,
  cancelItem,
  downloadInvoice,
  returnItem
};
