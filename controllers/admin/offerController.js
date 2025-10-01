const Offer = require("../../models/offerSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");


// ---------------- View All Offers Page ----------------

const getOffersPage = async (req, res) => {
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
    const categories = await Category.find({}, "name");

    res.render("offers", {
      offers,
      currentPage: page,
      totalPages,
      products,
      categories
    });
  } catch (err) {
    console.error("Error loading offers page:", err);
    res.status(500).send("Server error while loading offers");
  }
};

// ---------------- Create Offer ----------------

const createOffer = async (req, res) => {
  try {
    const { type, productId, categoryId, discountPercentage, startDate, endDate } = req.body;

    if (!type || !discountPercentage || !startDate || !endDate) {
      return res.json({ success: false, message: "Missing required fields" });
    }

    const newOffer = await Offer.create({
      type,
      productId: type === "Product" ? productId : null,
      categoryId: type === "Category" ? categoryId : null,
      discountPercentage,
      startDate,
      endDate
    });

    res.json({ success: true, message: "Offer created successfully", offer: newOffer });
  } catch (err) {
    console.error("Error creating offer:", err);
    res.json({ success: false, message: "Error creating offer" });
  }
};

// ---------------- Update Offer ----------------

const updateOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const { type, productId, categoryId, discountPercentage, startDate, endDate } = req.body;

    const updatedOffer = await Offer.findByIdAndUpdate(
      id,
      {
        type,
        productId: type === "Product" ? productId : null,
        categoryId: type === "Category" ? categoryId : null,
        discountPercentage,
        startDate,
        endDate
      },
      { new: true }
    );

    if (!updatedOffer) {
      return res.json({ success: false, message: "Offer not found" });
    }

    res.json({ success: true, message: "Offer updated successfully", offer: updatedOffer });
  } catch (err) {
    console.error("Error updating offer:", err);
    res.json({ success: false, message: "Error updating offer" });
  }
};

// ---------------- Delete Offer ----------------

const deleteOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Offer.findByIdAndDelete(id);

    if (!deleted) {
      return res.json({ success: false, message: "Offer not found" });
    }

    res.json({ success: true, message: "Offer deleted successfully" });
  } catch (err) {
    console.error("Error deleting offer:", err);
    res.json({ success: false, message: "Error deleting offer" });
  }
};

// ---------------- Toggle Status (Active/Inactive) ----------------

const toggleOfferStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const offer = await Offer.findById(id);
    if (!offer) return res.json({ success: false, message: "Offer not found" });

    offer.isActive = !offer.isActive;
    await offer.save();

    res.json({ success: true, message: `Offer ${offer.isActive ? "activated" : "deactivated"} successfully` });
  } catch (err) {
    console.error("Error toggling offer status:", err);
    res.json({ success: false, message: "Error toggling status" });
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