const Product = require('../../models/productSchema');
const Variants = require('../../models/variantSchema');
const mongoose = require("mongoose");
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const HTTP_STATUS = require('../../constants/httpStatus'); 



// ==================== LOAD VARIANTS (list all variants of a product) ======================

const loadVariant = async (req, res, next) => {
  try {
    const { productId, productName } = req.query;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).send("Invalid product ID");
    }

    const page = parseInt(req.query.page) || 1;
    const limit = 6;

    const variants = await Variants.find({ productId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const count = await Variants.countDocuments({ productId });

    res.status(HTTP_STATUS.OK).render("product-variant", {
      data: variants,
      currentPage: page,
      totalPages: Math.ceil(count / limit),
      msg: req.query.msg || null,
      productId,
      productName,
      success: req.query.success === "true"
    });

  } catch (error) {
    next(error);
  }
};



// ============================= ADD VARIANT ===================================

const addVariant = async (req, res, next) => {
  try {
    const { productId, size, colour, basePrice, salePrice, stock } = req.body;
    const productImage = req.files;

    if (!productId || !size || !colour || !basePrice || !salePrice || !stock) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "All fields are required",
      });
    }

    if (!productImage || productImage.length < 3) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "Please upload at least 3 images",
      });
    }

    const imagePaths = [];

    for (let i = 0; i < productImage.length; i++) {
      const file = productImage[i];
      const filename = `variant-${Date.now()}-${i}.jpeg`;
      const outputPath = path.join(__dirname, '../../public/uploads/products', filename);

      await sharp(file.buffer)
        .resize(500, 500)
        .toFormat('jpeg')
        .jpeg({ quality: 90 })
        .toFile(outputPath);

      imagePaths.push('/uploads/products/' + filename);
    }

    const newVariant = new Variants({
      productId,
      size,
      colour,
      basePrice,
      salePrice,
      stock,
      productImage: imagePaths
    });

    await newVariant.save();

    return res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: "Variant added successfully",
    });

  } catch (error) {
    next(error);
  }
};



// ================================ DELETE VARIANT ======================================

const deleteVariant = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "Invalid variant ID",
      });
    }

    const deleted = await Variants.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: "Variant not found",
      });
    }

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Variant deleted successfully",
      productId: deleted.productId,
    });

  } catch (error) {
    next(error);
  }
};


 
// ================================== UPDATE VARIANT =====================================

const updateVariant = async (req, res, next) => {
  try {
    const { id, size, colour, stock, basePrice, salePrice } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "Invalid variant ID",
      });
    }

    const updated = await Variants.findByIdAndUpdate(
      id,
      { size, colour, stock, basePrice, salePrice },
      { new: true }
    );

    if (!updated) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: "Variant not found",
      });
    }

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Variant updated successfully",
    });

  } catch (error) {
    next(error);
  }
};



///////////////////////////////////////////////////////////////////////////////////////////////////

module.exports = {
  loadVariant,
  addVariant,
  deleteVariant,
  updateVariant
}