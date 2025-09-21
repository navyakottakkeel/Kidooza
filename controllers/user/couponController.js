const Coupon = require("../../models/couponSchema");
const Order = require("../../models/orderSchema");


const applyCoupon = async (req, res) => {
  try {
    const { code, total, itemDiscount, platformFee, shippingFee } = req.body;
    const userId = req.user ? req.user._id : req.session.user;

    const coupon = await Coupon.findOne({
      code: code.trim().toUpperCase(),
      isActive: true
    });

    if (!coupon) {
      return res.json({ success: false, message: "Invalid or inactive coupon" });
    }

    if (coupon.expiryDate < new Date()) {
      return res.json({ success: false, message: "Coupon expired" });
    }

     // ✅ check if this user has already used this coupon in past orders
     const alreadyUsed = await Order.exists({
      user: userId,
      couponCode: code,
      couponApplied: true,
      status: { $ne: "Cancelled" } // optional: ignore cancelled orders
    });

    if (alreadyUsed) {
      return res.json({ success: false, message: "You have already used this coupon" });
    }

    // ✅ Net price after product discount
    const priceAfterItemDiscount = total - itemDiscount;

    if (coupon.minPurchase && priceAfterItemDiscount < coupon.minPurchase) {
      return res.json({
        success: false,
        message: `Minimum purchase of ₹${coupon.minPurchase} required`
      });
    }

    // ✅ calculate coupon discount
    let couponDiscount = 0;
    if (coupon.discountType === "percentage") {
      couponDiscount = (priceAfterItemDiscount * coupon.discountValue) / 100;
    } else {
      couponDiscount = coupon.discountValue;
    }

    // ✅ final grand total
    const grandTotal = Math.max(
      priceAfterItemDiscount - couponDiscount + platformFee + shippingFee,
      0
    );

    // save coupon in session
    req.session.appliedCoupon = {
      id: coupon._id,
      code: coupon.code,
      couponDiscount,
      grandTotal
    };

    return res.json({
      success: true,
      message: "Coupon applied successfully",
      couponDiscount,
      grandTotal,
      code: coupon.code
    });
  } catch (err) {
    console.error(err);
    return res.json({ success: false, message: "Something went wrong" });
  }
};


/////////////////////////////////////////////////////////////////////////////////////////////////////

const removeCoupon = async (req, res) => {
    try {
      req.session.appliedCoupon = null;
  
      const { total, itemDiscount, platformFee, shippingFee } = req.body;
  
      // net after item discount
      const priceAfterItemDiscount = total - itemDiscount;
  
      // grand total without coupon
      const grandTotal = Math.max(
        priceAfterItemDiscount + platformFee + shippingFee,
        0
      );
  
      return res.json({
        success: true,
        message: "Coupon removed successfully",
        couponDiscount: 0,
        grandTotal
      });
    } catch (err) {
      console.error(err);
      return res.json({ success: false, message: "Failed to remove coupon" });
    }
  };
  


module.exports = {
    applyCoupon,
    removeCoupon
}
