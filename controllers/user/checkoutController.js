const Product = require('../../models/productSchema');
const User = require('../../models/userSchema');
const Variant = require('../../models/variantSchema');
const Cart = require('../../models/cartSchema');
const Wishlist = require('../../models/wishlistSchema');
const Address = require('../../models/addressSchema');
const Wallet = require("../../models/walletSchema");
const Coupon = require("../../models/couponSchema");
const HTTP_STATUS = require("../../constants/httpStatus");


// -------------------- Helper Function ----------------------------------

function round2(num) {
  return parseFloat(Number(num || 0).toFixed(2));
}

// -------------------------- Get Checkout Page --------------------------------------------

const getCheckoutPage = async (req, res, next) => {
  try {
    const userId = req.user ? req.user._id : req.session.user;

    let user = null;
    if (req.user) {
      user = req.user;
    } else if (req.session.user) {
      user = await User.findById(req.session.user);
    }
    res.locals.user = user;

    // 🔹 Fetch addresses
    const addressDoc = await Address.findOne({ userId });
    let defaultAddress = null;
    let otherAddresses = [];

    if (addressDoc && addressDoc.addresses.length > 0) {
      defaultAddress = addressDoc.addresses.find((addr) => addr.isDefault);
      otherAddresses = addressDoc.addresses.filter((addr) => !addr.isDefault);
      if (!defaultAddress) {
        defaultAddress = addressDoc.addresses[0];
      }
    }

    // 🔹 Fetch cart (using stored prices)
    const cart = await Cart.findOne({ userId })
      .populate({
        path: "items.productId",
        select: "_id productName description isBlock",
      })
      .populate({
        path: "items.variantId",
        select: "_id productImage size stock",
      })
      .lean();

    if (!cart || cart.items.length === 0) {
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .redirect("/cart?msg=Your cart is empty");
    }

    // 🔹 Validate items (blocked / stock check)
    for (let item of cart.items) {
      if (item.productId.isBlock) {
        return res
          .status(HTTP_STATUS.BAD_REQUEST)
          .redirect(
            "/cart?msg=" +
              encodeURIComponent(`${item.productId.productName} is unavailable`)
          );
      }

      const stock = item.variantId ? item.variantId.stock : 0;
      if (stock < item.quantity) {
        return res
          .status(HTTP_STATUS.BAD_REQUEST)
          .redirect(
            "/cart?msg=" +
              encodeURIComponent(`${item.productId.productName} is out of stock`)
          );
      }
    }

    // 🔹 Calculate totals based on stored prices
    let totalItemPrice = 0,
      itemDiscount = 0;

    const cartItems = cart.items.map((item) => {
      const basePrice = round2(item.basePrice) || 0;
      const salePrice = round2(item.salePrice) || basePrice;
      const discount = round2(item.discount) || 0;

      totalItemPrice += round2(basePrice * item.quantity);
      if (basePrice > salePrice) {
        itemDiscount += round2((basePrice - salePrice) * item.quantity);
      }

      return {
        productId: item.productId?._id,
        variantId: item.variantId?._id || null,
        name: item.productId?.productName,
        description: item.productId?.description || "",
        image: item.variantId?.productImage?.[0] || "/img/1.jpg",
        size: item.variantId?.size || "",
        quantity: item.quantity,
        basePrice,
        salePrice,
        discount,
      };
    });

    const platformFee = 10;
    const shippingFee = totalItemPrice > 599 ? 0 : 30;
    const total = round2(totalItemPrice - itemDiscount + platformFee + shippingFee);

    const wallet = await Wallet.findOne({ userId });

    // ✅ Store checkout summary in session
    req.session.checkoutSummary = {
      orderedItems: cartItems,
      totalPrice: round2(totalItemPrice),
      itemDiscount: round2(itemDiscount),
      couponDiscount: 0,
      couponApplied: false,
      couponCode: null,
      platformFee,
      shippingFee,
      finalAmount: total,
      addressId: defaultAddress ? defaultAddress._id : null,
    };

    const responseData = {
      defaultAddress,
      otherAddresses,
      cartItems,
      totalItemPrice,
      itemDiscount,
      platformFee,
      shippingFee,
      total,
      user,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
      walletBalance: wallet ? wallet.balance : 0,
    }

    return res
      .status(HTTP_STATUS.OK)
      .render("checkout", responseData);
  } catch (error) {
    next(error);
  }
};

// -------------------------- Get Coupon List --------------------------------------------

const couponList = async (req, res, next) => {
  try {
    const today = new Date();

    const coupons = await Coupon.find({
      isActive: true,
      expiryDate: { $gte: today },
    }).lean();

    const responseData = {
      success: true,
      coupons: coupons.map((c) => ({
        code: c.code,
        discountType: c.discountType,
        discountValue: c.discountValue,
        minPurchase: c.minPurchase,
        expiryDate: c.expiryDate,
      })),
    }

    return res.status(HTTP_STATUS.OK).json(responseData);
  } catch (error) {
    next(error);
  }
};

// -------------------------- Exports --------------------------------

module.exports = {
  getCheckoutPage,
  couponList
};
