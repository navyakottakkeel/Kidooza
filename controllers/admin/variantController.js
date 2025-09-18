const Product = require('../../models/productSchema');
const Variants = require('../../models/variantSchema');
const mongoose = require("mongoose");
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');



////////////////////////////////////////////////////////////////////

const loadVariant = async (req, res) => {
    try {

        const productId = req.query.productId;
        const productName = req.query.productName;

        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).send("Invalid product ID");
          }

        let page = parseInt(req.query.page) || 1;
        const limit = 6;


        const variants = await Variants.find({ productId: new mongoose.Types.ObjectId(productId) })
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        const count = await Variants.countDocuments({productId});

        res.render("product-variant", {
            data: variants,
            currentPage: page,
            totalPages: Math.ceil(count / limit),
            msg: req.query.msg || null,
            productId,
            productName,
            success: req.query.success === "true"

        });


    } catch (error) {
        console.log("Error occured ", error)
    }


}

///////////////////////////////////////////////////////////////////////////

const addVariant = async (req, res) => {
  try {
    const { productId, productName, size, colour, basePrice, salePrice, stock } = req.body;
    const productImage = req.files;


    if (!req.files || req.files.length < 3) {
      return res.status(400).json({
        success: false,
        message: "Please upload at least 3 images"
      });
    }


    const imagePaths = [];

    for (let i = 0; i < productImage.length; i++) {
      const file = productImage[i];
      const filename = `product-${Date.now()}-${i}.jpeg`;
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

    return res.json({ success: true });
  } catch (error) {
    console.error("Error while adding variant:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};



////////////////////////////////////////////////////////////////////////////////////////////////

const deleteVariant = async (req, res) => {
    try {
      const { id } = req.params;
  
      const deleted = await Variants.findByIdAndDelete(id);
  
      if (!deleted) {
        return res.status(404).json({ success: false, message: "Variant not found" });
      }
  
      return res.status(200).json({
        success: true,
        message: "Variant deleted successfully",
        productId: deleted.productId,
      });
    } catch (error) {
      console.error("Error deleting variant:", error);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  };

  /////////////////////////////////////////////////////////////////////////////////////////////////

  const updateVariant = async (req, res) => {
    try {
      const { id, size, colour, stock, basePrice, salePrice } = req.body;
  
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: "Invalid variant ID" });
      }
  
      const updated = await Variants.findByIdAndUpdate(
        id,
        { size, colour, stock, basePrice, salePrice },
        { new: true }
      );
  
      if (!updated) {
        return res.status(404).json({ success: false, message: "Variant not found" });
      }
  
      return res.status(200).json({ success: true, message: "Variant updated successfully" });
    } catch (error) {
      console.error("Update error:", error);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  };

  
  ///////////////////////////////////////////////////////////////////////////////////////////////////

module.exports = {
    loadVariant,
    addVariant,
    deleteVariant,
    updateVariant
}