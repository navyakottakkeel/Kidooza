const Order = require("../../models/orderSchema");
const Cart = require("../../models/cartSchema");
const Address = require("../../models/addressSchema");
const User = require("../../models/userSchema");
const Variant = require("../../models/variantSchema");
const Wallet = require("../../models/walletSchema");
const Coupon = require("../../models/couponSchema");
const HTTP_STATUS = require("../../constants/httpStatus");


const PDFDocument = require("pdfkit");
const Razorpay = require("razorpay");
const crypto = require("crypto");


const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_SECRET,
});

// -------------------------- Load Order Placed --------------------------------------------

const loadOrderPlaced = async (req, res, next) => {
  try {
    const user = req.user || await User.findById(req.session.user);
    res.locals.user = user;
    res.status(HTTP_STATUS.OK).render("orderPlaced");
  } catch (error) {
    next(error);
  }
};
 
// -------------------------- Get Orders --------------------------------------------

const getOrders = async (req, res, next) => {
  try {
    const user = req.user || await User.findById(req.session.user);
    res.locals.user = user;

    const userId = user._id;
    const { search } = req.query;
    const filter = { user: userId };

    if (search) {
      const regex = new RegExp(search.trim(), "i");
      filter.$or = [
        { orderId: regex },
        { "orderedItems.productName": regex },
        { "orderedItems.size": regex }
      ];

      if (!isNaN(search)) {
        const numSearch = Number(search);
        filter.$or.push(
          { "orderedItems.salePrice": numSearch },
          { "orderedItems.total": numSearch },
          { finalAmount: numSearch }
        );
      }
    }

    const orders = await Order.find(filter)
      .populate("orderedItems.product")
      .populate("orderedItems.variant")
      .sort({ createdAt: -1 });

    res.status(HTTP_STATUS.OK).render("orders", { orders, query: req.query });
  } catch (error) {
    next(error);
  }
};

// -------------------------- Get Order Detail Pge --------------------------------------------

const getOrderDetail = async (req, res, next) => {
  try {
    const user = req.user || await User.findById(req.session.user);
    res.locals.user = user;

    const order = await Order.findById(req.params.id)
      .populate({
        path: "orderedItems.product",
        select: "productName images status",
      })
      .lean();

    if (!order) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Order not found" });
    }

    order.totalPrice = round2(order.totalPrice);
    order.discount = round2(order.discount);
    order.finalAmount = round2(order.finalAmount);
    order.shippingFee = round2(order.shippingFee);

    if (order.orderedItems) {
      order.orderedItems = order.orderedItems.map(item => ({
        ...item,
        basePrice: round2(item.basePrice),
        salePrice: round2(item.salePrice),
        total: round2(item.total)
      }));
    }

    res.status(HTTP_STATUS.OK).render("order-detail", { order });
  } catch (error) {
    next(error);
  }
};

// -------------------------- Cancel Order --------------------------------------------

const cancelOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const order = await Order.findById(id);
    if (!order)
      return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Order not found" });

    let refundAmount = 0;

    for (let item of order.orderedItems) {
      if (!["Shipped", "Out for Delivery", "Delivered"].includes(item.status)) {
        if (item.status !== "Cancelled") {
          let itemRefund = item.salePrice * item.quantity;

          if (order.couponApplied && order.couponDiscount > 0) {
            const totalSaleSum = order.orderedItems.reduce(
              (sum, i) => sum + i.salePrice * i.quantity,
              0
            );
            const itemShare = (item.salePrice * item.quantity) / totalSaleSum;
            const couponShare = order.couponDiscount * itemShare;
            itemRefund = round2(itemRefund - couponShare);
          }

          refundAmount += itemRefund;
          await Variant.findByIdAndUpdate(item.variant, { $inc: { stock: item.quantity } });
        }

        item.status = "Cancelled";
        item.cancelReason = reason || "Order cancelled";
      }
    }

    order.status = "Cancelled";
    order.cancelReason = reason || "Order cancelled";
    order.cancelledAt = new Date();

    if (order.paymentStatus === "Paid" && refundAmount > 0) {
      await Wallet.findOneAndUpdate(
        { userId: order.user },
        {
          $inc: { balance: refundAmount },
          $push: {
            transactions: {
              type: "credit",
              amount: refundAmount,
              reason: `Refund for order #${order._id}`,
              date: new Date()
            }
          }
        },
        { upsert: true, new: true }
      );
    }

    await order.save();

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message:
        refundAmount > 0
          ? `Order cancelled & ₹${refundAmount} refunded to wallet`
          : "Order cancelled (no refund needed)"
    });
  } catch (error) {
    next(error);
  }
};
// -------------------------- Cancel Item --------------------------------------------

const cancelItem = async (req, res, next) => {
  try {
    const { orderId, itemId } = req.params;
    const { reason } = req.body;

    const order = await Order.findById(orderId);
    if (!order)
      return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Order not found" });

    const item = order.orderedItems.id(itemId);
    if (!item)
      return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Item not found" });

    if (item.status.toLowerCase() === "shipped")
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Cannot cancel shipped item" });

    item.status = "Cancelled";
    item.cancelReason = reason;

    await Variant.findByIdAndUpdate(item.variant, { $inc: { stock: item.quantity } });

    if (order.paymentStatus === "Paid") {
      let refundAmount = item.salePrice * item.quantity;

      if (order.couponApplied && order.couponDiscount > 0) {
        const totalSaleSum = order.orderedItems.reduce(
          (sum, i) => sum + i.salePrice * i.quantity,
          0
        );
        const itemShare = (item.salePrice * item.quantity) / totalSaleSum;
        refundAmount = round2(refundAmount - order.couponDiscount * itemShare);
      }

      await Wallet.findOneAndUpdate(
        { userId: order.user },
        {
          $inc: { balance: refundAmount },
          $push: {
            transactions: {
              type: "credit",
              amount: refundAmount,
              reason: `Refund for cancelled item #${order._id}`,
              date: new Date()
            }
          }
        },
        { upsert: true, new: true }
      );
    }

    await order.save();
    res.status(HTTP_STATUS.OK).json({ success: true, message: "Item cancelled successfully" });
  } catch (error) {
    next(error);
  }
};

// -------------------------- Download Invoice--------------------------------------------

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
    next(error);
  }
};

// -------------------------- Return Item --------------------------------------------

const returnItem = async (req, res, next) => {
  try {
    const { orderId, itemId } = req.params;
    const { reason } = req.body;

    const order = await Order.findById(orderId);
    if (!order)
      return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Order not found" });

    const item = order.orderedItems.id(itemId);
    if (!item)
      return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Item not found" });

    if (item.status !== "Delivered")
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Return not available for this item" });

    item.status = "Return Requested";
    item.returnReason = reason;

    await order.save();
    res.status(HTTP_STATUS.OK).json({ success: true });
  } catch (error) {
    next(error);
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

const placeOrder = async (req, res, next) => {
  try {
    const userId = req.user ? req.user._id : req.session.user;
    const { addressId, paymentMethod, couponCode } = req.body;

    const {
      orderedItems,
      totalPrice,
      discount,
      platformFee,
      shippingFee,
      finalAmount,
      address,
      couponApplied,
      couponDiscount
    } = await buildOrderSnapshot(userId, addressId, couponCode);

    // ---------------- COD ----------------
    if (paymentMethod === "COD") {
      if (finalAmount > 1000) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: "Cash on Delivery is only available for orders below ₹1000.",
        });
      }

      const newOrder = new Order({
        user: userId,
        orderedItems,
        totalPrice,
        discount,
        finalAmount,
        shippingAddress: address,
        status: "Pending",
        invoiceDate: new Date(),
        platformFee,
        shippingFee,
        paymentMethod: "COD",
        paymentStatus: "Pending",
        couponApplied,
        couponCode: couponCode || "",
        couponDiscount,
      });
      await newOrder.save();

      // update stock & clear cart
      for (const item of orderedItems) {
        if (item.variant) {
          await Variant.findByIdAndUpdate(item.variant, { $inc: { stock: -item.quantity } });
        }
      }
      await Cart.updateOne({ userId }, { $set: { items: [] } });

      return res.status(HTTP_STATUS.OK).json({
        success: true,
        message: "Order placed successfully using COD.",
        redirectUrl: "/orderplaced",
      });
    }

    // ---------------- Wallet ----------------
    if (paymentMethod === "Wallet") {
      const wallet = await Wallet.findOne({ userId });
      if (!wallet || wallet.balance < finalAmount) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: "Insufficient wallet balance.",
        });
      }

      wallet.balance -= finalAmount;
      wallet.transactions.push({
        type: "debit",
        amount: finalAmount,
        reason: "Order Payment",
      });
      await wallet.save();

      const newOrder = new Order({
        user: userId,
        orderedItems,
        totalPrice,
        discount,
        finalAmount,
        shippingAddress: address,
        status: "Ordered",
        invoiceDate: new Date(),
        platformFee,
        shippingFee,
        paymentMethod: "Wallet",
        paymentStatus: "Paid",
        couponApplied,
        couponCode: couponCode || "",
        couponDiscount,
      });
      await newOrder.save();

      for (const item of orderedItems) {
        if (item.variant) {
          await Variant.findByIdAndUpdate(item.variant, { $inc: { stock: -item.quantity } });
        }
      }
      await Cart.updateOne({ userId }, { $set: { items: [] } });

      return res.status(HTTP_STATUS.OK).json({
        success: true,
        message: "Order placed successfully using Wallet.",
        redirectUrl: "/orderplaced",
      });
    }

    // ---------------- Razorpay ----------------
    return res.status(HTTP_STATUS.OK).json({
      success: true,
      useRazorpay: true,
      amount: finalAmount,
      message: "Proceed to online payment.",
    });

  } catch (error) {
    console.error("Error placing order:", error);
    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: "Server error while placing order." });
  }
};
// ------------------ 2) Create Razorpay order + create Pending DB order ------------------

const createRazorpayOrder = async (req, res, next) => {
  try {
    const userId = req.user ? req.user._id : req.session.user;
    const { addressId, couponCode } = req.body;

    const snapshot = await buildOrderSnapshot(userId, addressId, couponCode);
    const { orderedItems, totalPrice, discount, couponDiscount, couponApplied, platformFee, shippingFee, finalAmount, address } = snapshot;

    const rzpOrder = await razorpay.orders.create({
      amount: Math.round(finalAmount * 100),
      currency: "INR",
      receipt: "rcpt_" + Date.now()
    });

    const newOrder = new Order({
      user: userId,
      orderedItems,
      totalPrice,
      discount,
      finalAmount,
      shippingAddress: address,
      status: "Pending",
      invoiceDate: new Date(),
      platformFee,
      shippingFee,
      paymentMethod: "Razorpay",
      paymentStatus: "Pending",
      paymentGatewayOrderId: rzpOrder.id,
      couponApplied: !!req.session.appliedCoupon,
      couponCode: req.session.appliedCoupon?.code || "",
      couponDiscount
    });

    await newOrder.save();

    return res
      .status(HTTP_STATUS.CREATED)
      .json({
        success: true,
        key: process.env.RAZORPAY_KEY_ID,
        amount: rzpOrder.amount,
        currency: rzpOrder.currency,
        razorpayOrderId: rzpOrder.id,
        orderId: newOrder._id.toString()
      });
  } catch (error) {
    next(error);
  }
};


// ------------------ 3) Verify Razorpay signature and finalize order ------------------

const verifyRazorpayPayment = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res
        .status(HTTP_STATUS.NOT_FOUND)
        .json({ success: false, message: "Order not found" });
    }

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature === razorpay_signature) {
      order.paymentStatus = "Paid";
      order.status = "Ordered";
      order.orderedItems.forEach(item => item.status = "Ordered");

        for (const item of order.orderedItems) {
          if (item.variant) {
            await Variant.findByIdAndUpdate(item.variant, { $inc: { stock: -item.quantity } });
          }
        }

      await Cart.updateOne({ userId: order.user }, { $set: { items: [] } });

      await order.save();
     
      return res
        .status(HTTP_STATUS.OK)
        .json({ success: true, redirectUrl: "/orderplaced" });
    } else {
      order.paymentStatus = "Failed";
      order.status = "Order Not Placed";
      order.orderedItems.forEach(item => item.status = "Order Not Placed");
      await order.save();

      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .json({ success: false, redirectUrl: `/order/failure/${order._id}` });
    }
  } catch (error) {
    next(error);
  }
};


///////////////////////////////////////////////////////////////////////////////////////////////////

const retryPayment = async (req, res, next) => {
  try {
    const { orderId } = req.body;
    const order = await Order.findById(orderId);

    if (!order)
      return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Order not found" });

    if (order.paymentStatus === "Paid") {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Order already paid" });
    }

    const rzpOrder = await razorpay.orders.create({
      amount: Math.round(order.finalAmount * 100),
      currency: "INR",
      receipt: "rcpt_" + Date.now(),
    });

    order.paymentGatewayOrderId = rzpOrder.id;
    order.paymentStatus = "Pending";
    await order.save();

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      key: process.env.RAZORPAY_KEY_ID,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      razorpayOrderId: rzpOrder.id,
      orderId: order._id.toString(),
    });
  } catch (error) {
    next(error);
  }
};

/////////////////////////////////////////////////////////////////////////////////////////////////

const loadOrderFailure = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId).populate("user");

    if (!order) {
      // If order not found, redirect with a clear status
      return res
        .status(HTTP_STATUS.NOT_FOUND)
        .redirect("/orders");
    }

    // ✅ Normal render (200 OK)
    return res
      .status(HTTP_STATUS.OK)
      .render("orderFailure", { order, user: order.user });

  } catch (error) {
    next(error);
  }
};

///////////////////////////////////////////////////////////////////////////////////////////////////////

const razorpayFailure = async (req, res, next) => {
  try {
    const { orderId } = req.body;
    const order = await Order.findById(orderId);

    if (!order)
      return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Order not found" });

    order.paymentStatus = "Failed";
    order.status = "Order Not Placed";
    order.orderedItems.forEach(item => item.status = "Order Not Placed");
    await order.save();

    return res.status(HTTP_STATUS.OK).json({ success: true, message: "Order marked as failed" });
  } catch (error) {
    next(error);
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
