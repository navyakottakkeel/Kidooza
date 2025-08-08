const Product = require('../../models/productSchema');
const Varients = require('../../models/varientSchema');
const mongoose = require("mongoose");



////////////////////////////////////////////////////////////////////

const loadVarient = async (req, res) => {
    try {

        const productId = req.query.productId;
        const productName = req.query.productName;

        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).send("Invalid product ID");
          }

        let page = parseInt(req.query.page) || 1;
        const limit = 6;


        const varients = await Varients.find({ productId: new mongoose.Types.ObjectId(productId) })
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        const count = await Varients.countDocuments({productId});

        res.render("product-varient", {
            data: varients,
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

const addVarient = async (req, res) => {
    try {
        const { productId,productName, size, colour, stock } = req.body;


        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).send("Invalid product ID");
        }

        if (!size || size.trim() === "") {
          return res.redirect(`/admin/varients?productId=${productId}&productName=${productName}&msg=Size is required`);
      }
      if (!colour || colour.trim() === "") {
          return res.redirect(`/admin/varients?productId=${productId}&productName=${productName}&msg=Colour is required`);
      }
      

        const exists = await Varients.findOne({ 
          productId: new mongoose.Types.ObjectId(productId), 
          size, 
          colour 
      });

      if (exists) {
        return res.redirect(`/admin/varients?productId=${productId}&productName=${productName}&msg=Variant already exists`);
    }

        const newVarient = new Varients({
            productId,
            size,
            colour,
            stock
        });

        await newVarient.save();

        res.redirect(`/admin/varients?productId=${productId}&productName=${productName}&success=true`);
    } catch (error) {
        console.error("Error while adding varient:", error);
        res.status(500).send("Internal server error");
    }
};


////////////////////////////////////////////////////////////////////////////////////////////////

const deleteVarient = async (req, res) => {
    try {
      const { id } = req.params;
  
      const deleted = await Varients.findByIdAndDelete(id);
  
      if (!deleted) {
        return res.status(404).json({ success: false, message: "Varient not found" });
      }
  
      return res.status(200).json({
        success: true,
        message: "Varient deleted successfully",
        productId: deleted.productId,
      });
    } catch (error) {
      console.error("Error deleting varient:", error);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  };

  /////////////////////////////////////////////////////////////////////////////////////////////////

  const updateVarient = async (req, res) => {
    try {
      const { id, size, colour, stock } = req.body;
  
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: "Invalid variant ID" });
      }
  
      const updated = await Varients.findByIdAndUpdate(
        id,
        { size, colour, stock },
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
    loadVarient,
    addVarient,
    deleteVarient,
    updateVarient
}