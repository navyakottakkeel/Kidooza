
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');




const addProduct = async (req, res) => {
  try {
    const { productName, basePrice, salePrice, description, brand } = req.body;
    const productImage = req.files;

    const category = await Category.findById(req.body.category);
    if (!category) return res.status(400).send("Category not found");


    // Validation
    if (!productName || !basePrice || !description || !category || !brand || !productImage || productImage.length < 3) {
      const categories = await Category.find({ isDeleted: false });
      return res.render('add-product', {
        categories,
        error: 'All fields are required and at least 3 images must be uploaded.'
      });
    }

    if (parseFloat(salePrice) >= parseFloat(basePrice)) {
      const categories = await Category.find({ isDeleted: false });
      return res.render('add-product', {
        categories,
        error: 'Sale price must be less than base price.'
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

    // Save product
    const product = new Product({
      productName,
      basePrice,
      salePrice,
      description,
      category: category._id,
      brand,
      productImage: imagePaths, // Assume this is filled correctly
    });

    await product.save();

    const categories = await Category.find();
    res.render('add-product', {
      categories,
      success: 'Product added successfully!'
    });

  } catch (error) {
    console.error('Product add error:', error);
    const categories = await Category.find();
    res.render('add-product', {
      categories,
      error: 'Something went wrong while adding the product.'
    });
  }
};



///////////////////////////////////////////////////////////////////////////

const loadAddProduct = async (req, res) => {
  try {

    const categories = await Category.find({ isDeleted: false });
    res.render('add-product', {
      categories: categories
    });

  } catch (error) {
    res.redirect('/pageerror');
  }

}

//////////////////////////////////////////////////////////////////////////////////////


const loadProducts = async (req, res) => {
  try {
    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = 5;

    const matchStage = {
      $or: [
        { productName: { $regex: search, $options: "i" } },
        { brand: { $regex: search, $options: "i" } },
        { "categoryData.name": { $regex: search, $options: "i" } }
      ]
    };

    const products = await Product.aggregate([
      {
        $lookup: {
          from: 'categories',
          localField: 'category',
          foreignField: '_id',
          as: 'categoryData'
        }
      },
      { $unwind: "$categoryData" },
      { $match: search ? matchStage : {} },
      { $sort: { _id: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit }
    ]);

    const countAggregate = await Product.aggregate([
      {
        $lookup: {
          from: 'categories',
          localField: 'category',
          foreignField: '_id',
          as: 'categoryData'
        }
      },
      { $unwind: "$categoryData" },
      { $match: search ? matchStage : {} },
      { $count: "total" }
    ]);

    const total = countAggregate[0] ? countAggregate[0].total : 0;

    res.render("list-products", {
      data: products,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      search
    });

  } catch (error) {
    console.log("error", error);
    res.status(500).send("Internal Server Error");
  }
};

////////////////////////////////////////////////////////////////////////////////////////////

const updateProduct = async (req, res) => {
  try {
    const { _id, productName, description, category, brand, basePrice, salePrice, status } = req.body;

    const categoryData = await Category.findOne({ name: category });
    if (!categoryData) {
      return res.json({ success: false, message: 'Invalid category name' });
    }

    await Product.findByIdAndUpdate(_id, {
      productName,
      description,
      brand,
      basePrice,
      salePrice,
      category: categoryData._id,
      status
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Product update error:', error);
    res.json({ success: false, message: 'Server error' });
  }
};

////////////////////////////////////////////////////////////////////////////////////////

const softDeleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    await Product.findByIdAndUpdate(id, { isBlock: true });
    res.json({ success: true, message: "Product deleted (soft delete)" });
  } catch (error) {
    console.error("Soft delete error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


///////////////////////////////////////////////////////////////////////////////////////

module.exports = {
  addProduct,
  loadAddProduct,
  loadProducts,
  updateProduct,
  softDeleteProduct
}
