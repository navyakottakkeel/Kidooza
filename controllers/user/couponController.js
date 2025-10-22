const Coupon = require("../../models/couponSchema");
const Order = require("../../models/orderSchema");
const HTTP_STATUS = require("../../constants/httpStatus");


// -------------------- Helper Function ----------------------------------

function round2(num) {
  return parseFloat(Number(num || 0).toFixed(2));
}

// -------------------------- Apply Coupon --------------------------------------------

const applyCoupon = async (req, res, next) => {
  try {
    const { code, total, itemDiscount, platformFee, shippingFee, grandtotal } = req.body;
    const userId = req.user ? req.user._id : req.session.user;

    const coupon = await Coupon.findOne({
      code: code.trim().toUpperCase(),
      isActive: true,
    });

    if (!coupon) {
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .json({ success: false, message: "Invalid or inactive coupon" });
    }

    if (coupon.expiryDate < new Date()) {
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .json({ success: false, message: "Coupon expired" });
    }

    // ✅ Check if already used
    const alreadyUsed = await Order.exists({
      user: userId,
      couponCode: code,
      couponApplied: true,
      status: { $ne: "Cancelled" },
    });

    if (alreadyUsed) {
      return res
        .status(HTTP_STATUS.CONFLICT)
        .json({ success: false, message: "You have already used this coupon" });
    }

    // ✅ Net price after product-level discount
    const priceAfterItemDiscount = round2(total - itemDiscount);

    if (coupon.minPurchase && priceAfterItemDiscount < coupon.minPurchase) {
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .json({
          success: false,
          message: `Minimum purchase of ₹${coupon.minPurchase} required`,
        });
    }

    // ✅ Calculate coupon discount
    let couponDiscount = 0;
    if (coupon.discountType === "percentage") {
      couponDiscount = round2((grandtotal * coupon.discountValue) / 100);
    } else {
      couponDiscount = round2(coupon.discountValue);
    }

    // ✅ Final grand total
    const grandTotal = round2(
      Math.max(priceAfterItemDiscount - couponDiscount + platformFee + shippingFee, 0)
    );

    // ✅ Save coupon in session
    req.session.appliedCoupon = {
      id: coupon._id,
      code: coupon.code,
      couponDiscount,
      grandTotal,
    };

    return res
      .status(HTTP_STATUS.OK)
      .json({
        success: true,
        message: "Coupon applied successfully",
        couponDiscount,
        grandTotal,
        code: coupon.code,
      });
  } catch (error) {
    next(error);
  }
};

// -------------------------- Remove Coupon --------------------------------------------

const removeCoupon = async (req, res, next) => {
  try {
    req.session.appliedCoupon = null;

    const { total, itemDiscount, platformFee, shippingFee } = req.body;

    // ✅ Net after item discount
    const priceAfterItemDiscount = total - itemDiscount;

    // ✅ Grand total without coupon
    const grandTotal = Math.max(priceAfterItemDiscount + platformFee + shippingFee, 0);

    return res
      .status(HTTP_STATUS.OK)
      .json({
        success: true,
        message: "Coupon removed successfully",
        couponDiscount: 0,
        grandTotal,
      });
  } catch (error) {
    next(error);
  }
};

// -------------------------- Exports --------------------------------------------

module.exports = {
    applyCoupon,
    removeCoupon
}
