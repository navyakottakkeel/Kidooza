const Order = require("../../models/orderSchema");
const Cart = require("../../models/cartSchema");
const Address = require("../../models/addressSchema");
const User = require("../../models/userSchema");
const Variant = require("../../models/varientSchema"); // ✅ Import Variant model





const placeOrder = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.user;
    const { addressId, paymentMethod } = req.body;

    // 1. Get cart
    const cart = await Cart.findOne({ userId })
      .populate("items.productId")
      .populate("items.varientId");

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
     const basePrice = item.varientId?.basePrice || item.productId?.basePrice || 0;
     const salePrice = item.varientId?.salePrice || item.productId?.salePrice || basePrice;
     const quantity = item.quantity;

     const itemTotal = salePrice * quantity;

     totalPrice += basePrice * quantity;
     if (basePrice > salePrice) {
       discount += (basePrice - salePrice) * quantity;
     }

     return {
       product: item.productId._id,
       variant: item.varientId?._id || null,
       quantity,
       basePrice,
       salePrice,
       total: itemTotal
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


const loadOrderPlaced = async (req,res) => {
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



module.exports = { 
  placeOrder,
  loadOrderPlaced
};
