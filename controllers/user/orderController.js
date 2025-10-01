const Order = require("../../models/orderSchema");
const Cart = require("../../models/cartSchema");
const Address = require("../../models/addressSchema");
const User = require("../../models/userSchema");
const Variant = require("../../models/variantSchema");
const Wallet = require("../../models/walletSchema");
const Coupon = require("../../models/couponSchema");


const PDFDocument = require("pdfkit");
const Razorpay = require("razorpay");
const crypto = require("crypto");



const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_SECRET,
});


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

    if (search) {
      const s = search.trim();
      const regex = new RegExp(search, "i");

      filter.$or = [
        { orderId: regex },
        { "orderedItems.productName": { $regex: s, $options: "i" } },
        { "orderedItems.size": { $regex: s, $options: "i" } },
      ];

      if (!isNaN(search)) {
        const numSearch = Number(search);
        filter.$or.push({ "orderedItems.salePrice": numSearch });
        filter.$or.push({ "orderedItems.total": numSearch });
        filter.$or.push({ finalAmount: numSearch });
      }
    }


    const orders = await Order.find(filter)
      .populate("orderedItems.product")
      .populate("orderedItems.variant")
      .sort({ createdAt: -1 });

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
        // ✅ Ensure all price-related fields are fixed to 2 decimals
        order.totalPrice = round2(order.totalPrice);
        order.discount = round2(order.discount);
        order.finalAmount = round2(order.finalAmount);
        order.shippingFee = round2(order.shippingFee);
    
        if (order.orderedItems && order.orderedItems.length > 0) {
          order.orderedItems = order.orderedItems.map(item => ({
            ...item,
            basePrice: round2(item.basePrice),
            salePrice: round2(item.salePrice),
            total: round2(item.total),
          }));
        }

    res.render("order-detail", { order });
  } catch (err) {
    console.error("Error loading order detail:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

////////////////////////////////////////////////////////////////////////////////////////////

const cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const order = await Order.findById(id);
    if (!order) return res.json({ success: false, message: "Order not found" });

    let refundAmount = 0;

    // ✅ Cancel all items & restore stock
    for (let item of order.orderedItems) {
      if (!["Shipped", "Out for Delivery", "Delivered"].includes(item.status)) {

        if (item.status !== "Cancelled") {
          // Only refund for items that are being cancelled now
          let itemRefund = item.salePrice * item.quantity;

          if (order.couponApplied && order.couponDiscount > 0) {
            const totalSaleSum = order.orderedItems.reduce(
              (sum, i) => sum + (i.salePrice * i.quantity),
              0
            );
            const itemShare = (item.salePrice * item.quantity) / totalSaleSum;
            const couponShare = order.couponDiscount * itemShare;
            itemRefund = round2(itemRefund - couponShare);
          }
    
          refundAmount += itemRefund;

          await Variant.findByIdAndUpdate(
            item.variant,
            { $inc: { stock: item.quantity } }
          );
        }

        item.status = "Cancelled";
        item.cancelReason = reason || "Order cancelled";
      }
    }

    order.status = "Cancelled";
    order.cancelReason = reason || "Order cancelled";
    order.cancelledAt = new Date();


    // ✅ Refund if payment done
    if (order.paymentStatus === "Paid" && refundAmount > 0) {

      await Wallet.findOneAndUpdate(
        { userId: order.user },
        {
          $inc: { balance: refundAmount },
          $push: {
            transactions: {
              type: "credit",
              amount: refundAmount,
              reason: `Refund for cancelled order #${order._id}`,
              date: new Date()
            }
          }
        },
        { upsert: true, new: true }
      );
    }


    await order.save();

    res.json({
      success: true,
      message: refundAmount > 0
        ? `Order cancelled & ₹${refundAmount} refunded to wallet`
        : "Order cancelled (no refund needed)"
    });

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

    // ✅ Refund if payment done
    if (order.paymentStatus === "Paid") {

      let refundAmount = item.salePrice * item.quantity;

      if (order.couponApplied && order.couponDiscount > 0) {
        // Calculate proportion of coupon discount applicable to this item
        const totalSaleSum = order.orderedItems.reduce(
          (sum, i) => sum + (i.salePrice * i.quantity),
          0
        );
      
        const itemShare = (item.salePrice * item.quantity) / totalSaleSum;
        const couponShare = order.couponDiscount * itemShare;
      
        refundAmount = refundAmount - couponShare;
        refundAmount = round2(refundAmount); // keep 2 decimals
      }

     
      await Wallet.findOneAndUpdate(
        { userId: order.user },
        {
          $inc: { balance: refundAmount },
          $push: {
            transactions: {
              type: "credit",
              amount: refundAmount,
              reason: `Refund for cancelled order #${order._id}`,
              date: new Date()
            }
          }
        },
        { upsert: true, new: true }
      );
    }


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
    doc.text(`Subtotal: ₹${round2(order.totalPrice)}`);
    doc.text(`Discount: -₹${round2(order.discount)}`);
    // ✅ Add Coupon Row if applied
    if (order.couponApplied && order.couponDiscount > 0) {
      doc.fillColor("green").text(`Coupon (${order.couponCode}): -₹${order.couponDiscount}`);
      doc.fillColor("black"); // reset back to normal text color
    }
    doc.text(`Platform Fee: -₹${order.platformFee}`);
    doc.text(`Shipping Fee: -₹${order.shippingFee}`);
    doc.text(`Final Amount: ₹${round2(order.finalAmount)}`);
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

    if (item.status !== "Delivered") {
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

// ✅ Helper to round to 2 digits
function round2(num) {
  return parseFloat(Number(num || 0).toFixed(2));
}

// ------------------ Helper: compute order snapshot (shared) ------------------
async function buildOrderSnapshot(userId, addressId, couponCode) {
  const cart = await Cart.findOne({ userId })
    .populate("items.productId")
    .populate("items.variantId");

  if (!cart || cart.items.length === 0) throw new Error("Cart is empty");

  const addressDoc = await Address.findOne({ userId });
  const address = addressDoc?.addresses?.id(addressId);
  if (!address) throw new Error("Address not found");


  // ✅ Use cart values directly (already has salePrice, discount, total)
  const orderedItems = cart.items.map(item => ({
    product: item.productId._id,
    variant: item.variantId?._id || null,
    quantity: item.quantity,
    basePrice: round2(item.basePrice),
    salePrice: round2(item.salePrice),
    discount: round2(item.discount),
    productName: item.productId.productName,
    image: Array.isArray(item.variantId?.productImage)
      ? item.variantId.productImage[0]
      : (item.variantId?.productImage || item.productId.productImage?.[0] || ""),
    size: item.variantId?.size,
    color: item.variantId?.colour,
    total: round2(item.total),
    status: "Ordered"
  }));

  // ✅ Totals from cart
  const totalPrice = round2(cart.items.reduce((sum, i) => sum + i.basePrice * i.quantity, 0));
  let subTotal = round2(cart.items.reduce((sum, i) => sum + i.salePrice * i.quantity, 0));
  const discount = round2(totalPrice - subTotal);   // already includes offer discounts

  // ✅ Shipping rule
  const shippingFee = subTotal > 599 ? 0 : 30;
  const platformFee = 10;
  subTotal = subTotal + platformFee + shippingFee;

  // ✅ Coupon calculation
  let couponDiscount = 0;
  if (couponCode) {
    const coupon = await Coupon.findOne({ code: couponCode, isActive: true });
    if (coupon) {
      if (coupon.discountType === "fixed") {
        couponDiscount = round2(coupon.discountValue);
      } else if (coupon.discountType === "percentage") {
        couponDiscount = round2((subTotal * coupon.discountValue) / 100);
      }
    }
  }

  // ✅ Final amount
  const finalAmount = round2(subTotal - couponDiscount );


  return {
    orderedItems,
    totalPrice,          // original MRP sum
    discount,            // total offer discount
    couponDiscount,      
    couponApplied: !!couponDiscount,
    couponCode: couponCode || "",
    platformFee,
    shippingFee,
    finalAmount,
    address,
    cart
  };
}


// ------------------ 1) COD & Wallet handler ------------------
const placeOrder = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.user;
    const { addressId, paymentMethod, couponCode } = req.body;

    // build order details from server (never trust client)
    const { 
      orderedItems,
      totalPrice,
      discount,
      platformFee,
      shippingFee,
      finalAmount,
      address,
      cart,
      couponApplied,
      couponDiscount
     } = await buildOrderSnapshot(userId, addressId, couponCode);

     console.log("Checkout Final Amount:", finalAmount);

    // ----- COD rule: COD only allowed when finalAmount > 1000 (your requirement) -----
    if (paymentMethod === "COD") {
      if (!(finalAmount > 1000)) {
        return res.json({ success: false, message: "Cash on Delivery is only available for orders above ₹1000." });
      }

      // create and save order (COD pending)
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
        },
        status: "Pending",
        invoiceDate: new Date(),
        platformFee,
        shippingFee,
        paymentMethod: "COD",
        paymentStatus: "Pending",

        // ✅ Coupon details
        couponApplied: !!req.session.appliedCoupon,
        couponCode: req.session.appliedCoupon?.code || "",
        couponDiscount
      });



      await newOrder.save();

      // decrement stock immediately for COD
      for (const item of orderedItems) {
        if (item.variant) {
          await Variant.findByIdAndUpdate(item.variant, { $inc: { stock: -item.quantity } });
        }
      }

      // clear cart
      await Cart.updateOne({ userId }, { $set: { items: [] } });
      res.locals.cartCount = 0;

      return res.json({ success: true, orderId: newOrder._id, message: "Order placed with COD" });
    }

    // ---------------- Wallet payment -----------------------------

    if (paymentMethod === "Wallet") {
      let wallet = await Wallet.findOne({ userId });

      if (!wallet || wallet.balance < finalAmount) {
        return res.json({ success: false, message: "Insufficient wallet balance" });
      }


      if (wallet.balance < finalAmount) {
        return res.json({ success: false, message: "Insufficient wallet balance" });
      }

      // Create order and mark paid
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
        },
        status: "Ordered",
        invoiceDate: new Date(),
        platformFee,
        shippingFee,
        paymentMethod: "Wallet",
        paymentStatus: "Paid",
        // ✅ Save coupon details
        couponApplied: !!req.session.appliedCoupon,
        couponCode: req.session.appliedCoupon?.code || "",
        couponDiscount
      });




      await newOrder.save();

      // Deduct from wallet and log transaction
      wallet.balance -= finalAmount;
      wallet.transactions.push({
        type: "debit",
        amount: finalAmount,
        reason: "Order Payment"
      });
      await wallet.save();

      // decrement stock & clear cart
      for (const item of orderedItems) {
        if (item.variant) {
          await Variant.findByIdAndUpdate(item.variant, { $inc: { stock: -item.quantity } });
        }
      }
      await Cart.updateOne({ userId }, { $set: { items: [] } });
      res.locals.cartCount = 0;

      return res.json({ success: true, redirectUrl: "/orderplaced" });

      // return res.json({ success: true, orderId: newOrder._id, message: "Order placed using wallet" });
    }

    // -------------------------- Razorpay flow --------------------------------------------------
    return res.json({
      success: true,
      useRazorpay: true,
      amount: finalAmount,
      message: "Proceed to online payment",
      // frontend will then call /payment/razorpay/create to create gateway order & pending order
    });
  } catch (err) {
    console.error("placeOrder error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};


// ------------------ 2) Create Razorpay order + create Pending DB order ------------------

const createRazorpayOrder = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.user;
    const { addressId, couponCode } = req.body;

    // build snapshot
    const { orderedItems, totalPrice, discount, couponDiscount, couponApplied, platformFee, shippingFee, finalAmount, address, cart } =
      await buildOrderSnapshot(userId, addressId, couponCode);


    // Create Razorpay order (amount in paise)
    const rzpOrder = await razorpay.orders.create({
      amount: Math.round(finalAmount * 100),
      currency: "INR",
      receipt: "rcpt_" + Date.now()
    });

    // Create our DB order with status Pending (to later mark Paid on verification)
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
      },
      status: "Pending",
      couponApplied: false,
      invoiceDate: new Date(),
      platformFee,
      shippingFee,
      paymentMethod: "Razorpay",
      paymentStatus: "Pending",
      paymentGatewayOrderId: rzpOrder.id,
      couponApplied: !!req.session.appliedCoupon,
      couponCode: req.session.appliedCoupon?.code || "",
      couponDiscount,
    });
    await newOrder.save();

    // Return required data to front-end
    return res.json({
      success: true,
      key: process.env.RAZORPAY_KEY_ID,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      razorpayOrderId: rzpOrder.id,
      orderId: newOrder._id.toString()
    });
  } catch (err) {
    console.error("createRazorpayOrder error:", err);
    return res.status(500).json({ success: false, message: "Failed to initialize payment" });
  }
};

// ------------------ 3) Verify Razorpay signature and finalize order ------------------

const verifyRazorpayPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_SECRET)
      .update(body.toString())
      .digest("hex");

    // Fetch our pending order using DB _id (passed from frontend)
    const order = await Order.findById(orderId);
    if (!order) {
      return res.json({ success: false, redirectUrl: "/orders" });
    }

    if (expectedSignature === razorpay_signature) {
      // ✅ Payment success
      order.paymentStatus = "Paid";
      order.status = "Ordered";
      order.orderedItems.forEach(item => {
        item.status = "Ordered";
      });
      await order.save();

      // Deduct stock
      for (const item of order.orderedItems) {
        if (item.variant) {
          await Variant.findByIdAndUpdate(item.variant, { $inc: { stock: -item.quantity } });
        }
      }

      // Clear cart
      await Cart.updateOne({ userId: order.user }, { $set: { items: [] } });

      return res.json({ success: true, redirectUrl: "/orderplaced" });
    } else {
      // ❌ Payment failed
      order.paymentStatus = "Failed";
      order.status = "Order Not Placed";
      order.orderedItems.forEach(item => {
        item.status = "Order Not Placed";
      });
      await order.save();

      await Cart.updateOne({ userId: order.user }, { $set: { items: [] } });

      return res.json({ success: false, redirectUrl: `/order/failure/${order._id}` });
    }
  } catch (err) {
    console.error("Error verifying Razorpay:", err);
    return res.json({ success: false, redirectUrl: "/order/failure" });
  }
};


///////////////////////////////////////////////////////////////////////////////////////////////////


// POST /payment/razorpay/retry
const retryPayment = async (req, res) => {
  try {
    const { orderId } = req.body;

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    if (order.paymentStatus === "Paid") {
      return res.status(400).json({ success: false, message: "Order already paid" });
    }

    // Create a new Razorpay order
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_SECRET
    });

    const options = {
      amount: order.finalAmount * 100, // in paise
      currency: "INR",
      receipt: "rcpt_" + Date.now(),
    };

    const rzpOrder = await razorpay.orders.create(options);

    // store latest rzp order id in DB for tracking
    order.razorpayOrderId = rzpOrder.id;
    order.paymentStatus = "Pending";
    await order.save();

    return res.json({ success: true, rzpOrder });
  } catch (err) {
    console.error("Retry payment error:", err);
    return res.status(500).json({ success: false });
  }
};


/////////////////////////////////////////////////////////////////////////////////////////////////

const loadOrderFailure = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId).populate("user");

    if (!order) {
      return res.redirect("/orders"); // fallback
    }

    res.render("orderFailure", { order, user: order.user });
  } catch (err) {
    console.error("Error loading failure page:", err);
    res.redirect("/orders");
  }
};

///////////////////////////////////////////////////////////////////////////////////////////////////////

// POST /payment/razorpay/failure
const razorpayFailure = async (req, res) => {
  try {
    const { orderId, error } = req.body;

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ success: false });

    // mark failed
    order.paymentStatus = "Failed";
    order.status = "Order Not Placed";
    order.orderedItems.forEach(item => {
      item.status = "Order Not Placed";
    });
    await order.save();

    await Cart.updateOne({ userId: order.user }, { $set: { items: [] } });

    // DO NOT clear cart here — failed order means user might retry
    // So cart should remain untouched (that’s why in your case it's not being cleared, which is correct design)

    return res.json({ success: true });
  } catch (err) {
    console.error("razorpayFailure error:", err);
    return res.status(500).json({ success: false });
  }
};



module.exports = {
  placeOrder,
  loadOrderPlaced,
  getOrders,
  getOrderDetail,
  cancelOrder,
  cancelItem,
  downloadInvoice,
  returnItem,
  createRazorpayOrder,
  verifyRazorpayPayment,
  retryPayment,
  loadOrderFailure,
  razorpayFailure

};
