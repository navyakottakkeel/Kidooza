const Offer = require("../../models/offerSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const HTTP_STATUS = require("../../constants/httpStatus");


// ---------------- View All Offers Page ----------------

const getOffersPage = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    const totalOffers = await Offer.countDocuments();
  
    const offers = await Offer.find()
      .populate("productId", "productName")
      .populate("categoryId", "name")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const totalPages = Math.ceil(totalOffers / limit);

    const products = await Product.find({}, "productName");
    const categories = await Category.find({ isDeleted: false }, "name");

    const responseData = {
      offers,
      currentPage: page,
      totalPages,
      products,
      categories,
    }

    return res.status(HTTP_STATUS.OK).render("offers", responseData);
  } catch (error) {
    next(error)
  }
};

// ---------------- Create Offer ----------------

const createOffer = async (req, res, next) => {
  try {
    const { type, productId, categoryId, discountPercentage, startDate, endDate } = req.body;

    if (!type || !discountPercentage || !startDate || !endDate) {
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .json({ success: false, message: "Missing required fields" });
    }

    const newOffer = await Offer.create({
      type,
      productId: type === "Product" ? productId : null,
      categoryId: type === "Category" ? categoryId : null,
      discountPercentage,
      startDate,
      endDate,
    });

    return res
      .status(HTTP_STATUS.CREATED)
      .json({ success: true, message: "Offer created successfully", offer: newOffer });
  } catch (error) {
    next(error)
  }
};

// ---------------- Update Offer ----------------

const updateOffer = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { type, productId, categoryId, discountPercentage, startDate, endDate } = req.body;

    if (!type || !discountPercentage || !startDate || !endDate) {
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .json({ success: false, message: "Missing required fields" });
    }

    const updatedOffer = await Offer.findByIdAndUpdate(
      id,
      {
        type,
        productId: type === "Product" ? productId : null,
        categoryId: type === "Category" ? categoryId : null,
        discountPercentage,
        startDate,
        endDate,
      },
      { new: true }
    );

    if (!updatedOffer) {
      return res
        .status(HTTP_STATUS.NOT_FOUND)
        .json({ success: false, message: "Offer not found" });
    }

    return res
      .status(HTTP_STATUS.OK)
      .json({ success: true, message: "Offer updated successfully", offer: updatedOffer });
  } catch (error) {
    next(error)
  }
};

// ---------------- Delete Offer ----------------

const deleteOffer = async (req, res, next) => {
  try {
    const { id } = req.params;
    const deletedOffer = await Offer.findByIdAndDelete(id);

    if (!deletedOffer) {
      return res
        .status(HTTP_STATUS.NOT_FOUND)
        .json({ success: false, message: "Offer not found" });
    }

    return res
      .status(HTTP_STATUS.OK)
      .json({ success: true, message: "Offer deleted successfully" });
  } catch (error) {
    next(error)
  }
};

// ---------------- Toggle Status (Active/Inactive) ----------------

const toggleOfferStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const offer = await Offer.findById(id);

    if (!offer) {
      return res
        .status(HTTP_STATUS.NOT_FOUND)
        .json({ success: false, message: "Offer not found" });
    }

    offer.isActive = !offer.isActive;
    await offer.save();

    return res
      .status(HTTP_STATUS.OK)
      .json({
        success: true,
        message: `Offer ${offer.isActive ? "activated" : "deactivated"} successfully`,
      });
  } catch (error) {
    next(error)
  }
};
 
// --------------------------------------------------------------------------------------------------

module.exports = {
    getOffersPage,
    createOffer,
    updateOffer,
    deleteOffer,
    toggleOfferStatus
}