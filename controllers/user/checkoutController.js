const Product = require('../../models/productSchema');
const User = require('../../models/userSchema');
const Variant = require('../../models/variantSchema');
const Cart = require('../../models/cartSchema');
const Wishlist = require('../../models/wishlistSchema'); 
const Address = require('../../models/addressSchema');



const getCheckoutPage = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.session.user;

    let user = null;
        if (req.user) {
            user = req.user;
        } else if (req.session.user) {
            user = await User.findById(req.session.user);
        }

        res.locals.user = user;

        const addressDoc = await Address.findOne({ userId });
        let defaultAddress = null;
        let otherAddresses = [];
        
        if (addressDoc && addressDoc.addresses.length > 0) {
          defaultAddress = addressDoc.addresses.find(addr => addr.isDefault);
          otherAddresses = addressDoc.addresses.filter(addr => !addr.isDefault);
          if (!defaultAddress) {
            defaultAddress = addressDoc.addresses[0];
          }
        }

    // Fetch cart items (same as getCartPage)
    const cart = await Cart.findOne({ userId })
      .populate({
        path: "items.productId",
        select: "_id productName description"
      })
      .populate({
        path: "items.variantId",
        select: "_id productImage basePrice salePrice size stock"
      })
      .lean();

    if (!cart || cart.items.length === 0) {
      return res.redirect("/cart"); // no items, redirect to cart
    }

       // filter out out-of-stock items
       const stockedItems = cart.items.filter(item => {
        const stock = item.variantId?.stock ?? item.productId?.stock ?? 0;
        return stock > 0;
      });
  
      if (stockedItems.length === 0) {
        // nothing to checkout, redirect back
        return res.redirect("/cart");
      }

     // calculate totals only with stocked items
     let totalItemPrice = 0, itemDiscount = 0;
     const cartItems = stockedItems.map(item => {
       const basePrice = item.variantId?.basePrice || item.productId?.basePrice || 0;
       const salePrice = item.variantId?.salePrice || item.productId?.salePrice || basePrice;
 
       totalItemPrice += basePrice * item.quantity;
       if (basePrice > salePrice) {
         itemDiscount += (basePrice - salePrice) * item.quantity;
       }

      return {
        productId: item.productId?._id,
        variantId: item.variantId?._id || null,
        name: item.productId?.productName,
        image: item.variantId?.productImage?.[0] || "/img/1.jpg",
        size: item.variantId?.size,
        quantity: item.quantity,
        salePrice,
        basePrice
      };
    });

    const platformFee = 10;
    const shippingFee = totalItemPrice > 599 ? 0 : 30;
    const total = totalItemPrice - itemDiscount + platformFee + shippingFee;


    res.render("checkout", {
      defaultAddress,
      otherAddresses,
      cartItems,
      totalItemPrice,
      itemDiscount,
      platformFee,
      shippingFee,
      total
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};



module.exports = { 
    getCheckoutPage
 };
