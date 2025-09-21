const Coupon = require("../../models/couponSchema");


const getCoupons = async (req, res) => {
    try {
      let page = parseInt(req.query.page) || 1;  // current page
      let limit = 5; // coupons per page
      let skip = (page - 1) * limit;
  
      const totalCoupons = await Coupon.countDocuments();
      const coupons = await Coupon.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
  
      res.render("coupons", {
        coupons,
        currentPage: page,
        totalPages: Math.ceil(totalCoupons / limit)
      });
    } catch (err) {
      console.error("Error loading coupons:", err);
      res.redirect("/admin/pageerror");
    }
  };

//////////////////////////////////////////////////////////////////////////////////////////////////////


const createCoupon = async (req, res) => {
  try {
    const { code, discountType, discountValue, minPurchase, expiryDate } = req.body;

    // ✅ Validations
    if (!code || !discountType || !discountValue || !expiryDate) {
      return res.json({ success: false, message: "All required fields must be filled" });
    }

    if (discountType === "percentage" && (discountValue <= 0 || discountValue > 90)) {
      return res.json({ success: false, message: "Percentage must be between 1 and 90" });
    }

    if (discountType === "fixed" && discountValue <= 0) {
      return res.json({ success: false, message: "Fixed discount must be greater than 0" });
    }

    const existing = await Coupon.findOne({ code: code.toUpperCase() });
    if (existing) {
      return res.json({ success: false, message: "Coupon code already exists" });
    }

    await Coupon.create({
      code: code.toUpperCase(),
      discountType,
      discountValue,
      minPurchase: minPurchase || 0,
      expiryDate
    });

    res.json({ success: true, message: "Coupon created successfully" });
  } catch (error) {
    console.error(error);
    res.json({ success: false, message: "Server error" });
  }
};

///////////////////////////////////////////////////////////////////////////////////////////////////////

const deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    await Coupon.findByIdAndDelete(id);
    res.json({ success: true, message: "Coupon deleted successfully" });
  } catch (error) {
    console.error(error);
    res.json({ success: false, message: "Failed to delete coupon" });
  }
};

//////////////////////////////////////////////////////////////////////////////////////////////////////

module.exports = {
    getCoupons,
    createCoupon,
    deleteCoupon
}
