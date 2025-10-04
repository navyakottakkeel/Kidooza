const Order = require("../../models/orderSchema");
const Product = require("../../models/productSchema");
const Variant = require("../../models/variantSchema"); 
const Wallet = require("../../models/walletSchema");




const normalize = s => (s || "").toString().trim().toLowerCase();

async function adjustStockForItem(item, direction = +1) {
  // direction +1 = increment stock (on cancel/return), -1 = decrement (usually handled at checkout)
  if (item.variant) {
    await Variant.updateOne({ _id: item.variant }, { $inc: { stock: direction * item.quantity } });
  } 
}

function recomputeOrderStatus(order) {
  // Aggregate item statuses into overall order status
  const statuses = order.orderedItems.map(i => normalize(i.status));
  if (statuses.every(s => s === "cancelled")) return "Cancelled";
  if (statuses.every(s => s === "delivered")) return "Delivered";
  if (statuses.some(s => s === "out for delivery")) return "Out for Delivery";
  if (statuses.some(s => s === "shipped")) return "Shipped";
  if (statuses.every(s => s === "ordered")) return "Processing"; // or Pending
  return order.status || "Pending";
}

// ---------- List Orders ----------
const listOrders = async (req, res) => {
  try {
    const {
      search = "",                 // orderId, user name/email, product name, size, price
      status = "",                 // Pending/Shipped/Out for Delivery/Delivered/Cancelled
      sort = "date_desc",          // date_desc | date_asc | amount_desc | amount_asc
      page = 1,
      limit = 10
    } = req.query;

    const q = [];
    if (search) {
      const s = search.trim();
      q.push(
        { orderId: { $regex: s, $options: "i" } },
        { "shippingAddress.name": { $regex: s, $options: "i" } },
        { "shippingAddress.phone": { $regex: s, $options: "i" } },
        { "orderedItems.productName": { $regex: s, $options: "i" } },
        { "orderedItems.size": { $regex: s, $options: "i" } },
        // numeric price search (matches salePrice/total/finalAmount)
        ...(Number.isFinite(+s) ? [
          { finalAmount: +s },
          { "orderedItems.total": +s },
          { "orderedItems.salePrice": +s }
        ] : [])
      );
    }

    const filter = {};
    if (status) filter.status = status;

    const findQuery = {
      ...filter,
      ...(q.length ? { $or: q } : {})
    };

    let sortSpec = { createdAt: -1 };
    if (sort === "date_asc") sortSpec = { createdAt: 1 };
    if (sort === "amount_desc") sortSpec = { finalAmount: -1 };
    if (sort === "amount_asc") sortSpec = { finalAmount: 1 };

    const pageNum = Math.max(parseInt(page) || 1, 1);
    const pageSize = Math.max(parseInt(limit) || 10, 1);
    const skip = (pageNum - 1) * pageSize;

    const [orders, total] = await Promise.all([
      Order.find(findQuery)
        .sort(sortSpec)
        .skip(skip)
        .limit(pageSize)
        .lean(),
      Order.countDocuments(findQuery)
    ]);

    res.render("order-list", {
      orders,
      total,
      page: pageNum,
      pages: Math.ceil(total / pageSize),
      query: { search, status, sort, limit: pageSize }
    });
  } catch (e) {
    console.error(e);
    res.status(500).render("admin-error");
  }
};


////////////////////////////////////////////////////////////////////////////////////////////

const getOrderDetail = async (req, res) => {
    try {
      const order = await Order.findById(req.params.orderId).lean();
      res.render("order-details", { order });
    } catch (e) {
      console.error(e);
      res.status(500).render("admin-error");
    }
  };


  ////////////////////////////////////////////////////////////////////////////////////////////

  const updateOrderStatus = async (req, res) => {
    try {
      const { orderId } = req.params;
      const { status } = req.body; // Pending/Shipped/Out for Delivery/Delivered/Cancelled
  
      const order = await Order.findById(orderId);
      if (!order) return res.json({ success: false, message: "Order not found" });
  
      const old = order.status;
      order.status = status;
      order.statusHistory.push({ status });
  
      if (normalize(status) === "delivered") {
        order.deliveredAt = new Date();
      }

      if (status === "Shipped" || status === "Out for Delivery" || status === "Delivered") {
        order.orderedItems.forEach(item => {
          if (normalize(item.status) !== "cancelled") {
            item.status = status;
          }
        });
      }
      
     
      await order.save();
      return res.json({ success: true, old, now: order.status });
    } catch (e) {
      console.error(e);
      res.json({ success: false, message: "Server error" });
    }
  };


  ////////////////////////////////////////////////////////////////////////////////////////////

  const updateItemStatus = async (req, res) => {
    try {
      const { orderId, itemId } = req.params;
      const { status } = req.body; // Ordered/Shipped/Out for Delivery/Delivered/Cancelled
  
      const order = await Order.findById(orderId);
      if (!order) return res.json({ success: false, message: "Order not found" });
  
      const item = order.orderedItems.id(itemId);
      if (!item) return res.json({ success: false, message: "Item not found" });
  
      const old = item.status;
      item.status = status;
  
      // Restock if cancelling
      if (normalize(status) === "cancelled" && normalize(old) !== "cancelled") {
        await adjustStockForItem(item, +1);
      }
  
      // If delivered, stamp deliveredOn
      if (normalize(status) === "delivered") {
        if(order.paymentMethod ==='COD'){
          order.paymentStatus = 'Paid';
          item.deliveredOn = new Date();
        }else{
          item.deliveredOn = new Date();
        }
      }
  
      // Recompute overall order status
      order.status = recomputeOrderStatus(order);
      order.statusHistory.push({ status: `Item ${itemId} → ${status}` });
  
      await order.save();
      return res.json({ success: true, itemOld: old, itemNow: item.status, orderStatus: order.status });
    } catch (e) {
      console.error(e);
      res.json({ success: false, message: "Server error" });
    }
  };

  ///////////////////////////////////////////////////////////////////////////////////////////

  const verifyReturn = async (req, res) => {
    try {
      const { orderId, itemId } = req.params;
      const { action } = req.body; // "accept" | "reject"
  
      const order = await Order.findById(orderId);
      if (!order) return res.json({ success: false, message: "Order not found" });
  
      const item = order.orderedItems.id(itemId);
      if (!item) return res.json({ success: false, message: "Item not found" });
  
      if (normalize(item.status) !== "return requested")
        return res.json({ success: false, message: "No return request to verify" });
  
      if (action === "accept") {
        item.status = "Returned";
        await adjustStockForItem(item, +1);
  
        //Refund the item TOTAL to wallet
        let refundAmount = item.salePrice * item.quantity;

        if (order.couponApplied && order.couponDiscount > 0) {
          const totalSaleSum = order.orderedItems.reduce(
            (sum, i) => sum + (i.salePrice * i.quantity),
            0
          );
  
          if (totalSaleSum > 0) {
            const itemShare = (item.salePrice * item.quantity) / totalSaleSum;
            const couponShare = order.couponDiscount * itemShare;
            refundAmount = refundAmount - couponShare;
          }
        }
  
        refundAmount = Math.round(refundAmount * 100) / 100; // keep 2 decimals
        
        let wallet = await Wallet.findOne({ userId: order.user });
        if (!wallet) wallet = await Wallet.create({ userId: order.user, balance: 0, transactions: [] });
        wallet.balance += refundAmount;
        wallet.transactions.push({
          type: "credit",
          amount: refundAmount,
          reason: `Return accepted for item ${item.productName}`,
          createdAt: new Date()
        });
        await wallet.save();
      } else {
        // reject
        item.status = "Delivered"; // stays delivered if return rejected
      }
  
      order.status = recomputeOrderStatus(order);
      order.statusHistory.push({ status: `Return ${action} for item ${itemId}` });
  
      await order.save();
      res.json({ success: true, itemStatus: item.status, orderStatus: order.status });
    } catch (e) {
      console.error(e);
      res.json({ success: false, message: "Server error" });
    }
  };

  ///////////////////////////////////////////////////////////////////////////////////////////

  module.exports = {
    listOrders,
    getOrderDetail,
    updateOrderStatus,
    updateItemStatus,
    verifyReturn
}