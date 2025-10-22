const Coupon = require("../../models/couponSchema");
const HTTP_STATUS = require("../../constants/httpStatus");

///////////////////////////////////////////////////////////////////////////////////////

const getCoupons = async (req, res, next) => {
  try {
    let page = parseInt(req.query.page) || 1;  
    let limit = 5;  
    let skip = (page - 1) * limit;

    const totalCoupons = await Coupon.countDocuments();
    const coupons = await Coupon.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return res.status(HTTP_STATUS.OK).render("coupons", {
      coupons,
      currentPage: page,
      totalPages: Math.ceil(totalCoupons / limit),
    });
  } catch (error) {
    next(error);
  }
};

/////////////////////////////////////////////////////////////////////////////////////////

const createCoupon = async (req, res, next) => {
  try {
    const { code, discountType, discountValue, minPurchase, expiryDate } = req.body;

    if (!code || !discountType || !discountValue || !expiryDate) {
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .json({ success: false, message: "All required fields must be filled" });
    }

    if (discountType === "percentage" && (discountValue <= 0 || discountValue > 90)) {
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .json({ success: false, message: "Percentage must be between 1 and 90" });
    }

    if (discountType === "fixed" && discountValue <= 0) {
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .json({ success: false, message: "Fixed discount must be greater than 0" });
    }

    const existing = await Coupon.findOne({ code: code.toUpperCase() });
    if (existing) {
      return res
        .status(HTTP_STATUS.CONFLICT)
        .json({ success: false, message: "Coupon code already exists" });
    }

    await Coupon.create({
      code: code.toUpperCase(),
      discountType,
      discountValue,
      minPurchase: minPurchase || 0,
      expiryDate,
    });

    return res
      .status(HTTP_STATUS.CREATED)
      .json({ success: true, message: "Coupon created successfully" });
  } catch (error) {
    next(error);
  }
};

/////////////////////////////////////////////////////////////////////////////////////////

const deleteCoupon = async (req, res, next) => {
  try {
    const { id } = req.params;

    const deleted = await Coupon.findByIdAndDelete(id);
    if (!deleted) {
      return res
        .status(HTTP_STATUS.NOT_FOUND)
        .json({ success: false, message: "Coupon not found" });
    }

    return res
      .status(HTTP_STATUS.OK)
      .json({ success: true, message: "Coupon deleted successfully" });
  } catch (error) {
    next(error);
  }
};

/////////////////////////////////////////////////////////////////////////////////////////

module.exports = {
    getCoupons,
    createCoupon,
    deleteCoupon
}
