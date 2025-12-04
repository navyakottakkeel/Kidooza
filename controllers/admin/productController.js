
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const HTTP_STATUS = require("../../constants/httpStatus");


// ---------------------------- Add Product ---------------------------------

const addProduct = async (req, res, next) => {
  try {
    const { productName, basePrice, salePrice, description, brand, category: categoryId } = req.body;
    const productImage = req.files;

    const category = await Category.findById(categoryId);
    if (!category) return res.status(HTTP_STATUS.NOT_FOUND).send("Category not found");

    // Validation
    if (!productName || !basePrice || !description || !brand || !productImage || productImage.length < 3) {
      const categories = await Category.find({ isDeleted: false });
      return res.status(HTTP_STATUS.BAD_REQUEST).render("add-product", {
        categories,
        error: "All fields are required and at least 3 images must be uploaded."
      });
    }

    if (parseFloat(salePrice) >= parseFloat(basePrice)) {
      const categories = await Category.find({ isDeleted: false });
      return res.status(HTTP_STATUS.BAD_REQUEST).render("add-product", {
        categories,
        error: "Sale price must be less than base price."
      });
    }

    const imagePaths = [];

    for (let i = 0; i < productImage.length; i++) {
      const file = productImage[i];
      const filename = `product-${Date.now()}-${i}.jpeg`;
      const outputPath = path.join(__dirname, "../../public/uploads/products", filename);

      await sharp(file.buffer)
        .resize(500, 500)
        .toFormat("jpeg")
        .jpeg({ quality: 90 })
        .toFile(outputPath);

      imagePaths.push("/uploads/products/" + filename);
    }

    // Save product
    const product = new Product({
      productName,
      basePrice,
      salePrice,
      description,
      category: category._id,
      brand,
      productImage: imagePaths
    });

    await product.save();

    const categories = await Category.find();

    const responseData = {
      categories,
      success: "Product added successfully!"
    }

    return res.status(HTTP_STATUS.CREATED).render("add-product", responseData);
  } catch (error) {
    next(error);
  }
};

// ----------------------------- Load Add Product Page ----------------------------

const loadAddProduct = async (req, res, next) => {
  try {
    const categories = await Category.find({ isDeleted: false });
    res.status(HTTP_STATUS.OK).render("add-product", { categories });
  } catch (error) {
    next(error);
  }
};

// ------------------------- Load Products List ----------------------------

const loadProducts = async (req, res, next) => {
  try {
    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    let matchStage = {};

    if (search) {
      matchStage = {
        $or: [
          { productName: { $regex: search, $options: "i" } },
          { brand: { $regex: search, $options: "i" } },
          { "categoryData.name": { $regex: search, $options: "i" } }
        ]
      };
    }

    const products = await Product.aggregate([
      {
        $lookup: {
          from: "categories",
          localField: "category",
          foreignField: "_id",
          as: "categoryData"
        }
      },
      { $unwind: "$categoryData" },
      { $match: matchStage },
      { $sort: { _id: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit }
    ]);

    const countAggregate = await Product.aggregate([
      {
        $lookup: {
          from: "categories",
          localField: "category",
          foreignField: "_id",
          as: "categoryData"
        }
      },
      { $unwind: "$categoryData" },
      { $match: matchStage },
      { $count: "total" }
    ]);

    const total = countAggregate[0] ? countAggregate[0].total : 0;
    const totalPages = Math.ceil(total / limit);

    const categories = await Category.find({ isDeleted: false });

    const responseData = {
      data: products,
      categories,
      currentPage: page,
      totalPages,
      search,
      msg: req.query.msg || null
    };

    res.status(HTTP_STATUS.OK).render("list-products", responseData);
  } catch (error) {
    next(error);
  }
};

// ----------------------- Toggle Block/Unblock Product ---------------------------

const toggleBlockProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { isBlock } = req.body;

    const product = await Product.findByIdAndUpdate(id, { isBlock }, { new: true });
    if (!product) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Product not found" });
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `Product ${isBlock ? "deleted" : "restored"} successfully.`
    });
  } catch (error) {
    next(error);
  }
};

// --------------------------- Update Product Image --------------------------

const updateProductImage = async (req, res, next) => {
  try {
    const { productId, index } = req.body;

    if (!productId || typeof index === "undefined" || !req.file) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Invalid data." });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Product not found." });
    }

    const oldImagePath = product.productImage[index]
      ? path.join(__dirname, "../public", product.productImage[index])
      : null;

    const fileName = `${uuidv4()}.png`;
    const filePath = path.join(process.cwd(), "public", "uploads", "products", fileName);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, req.file.buffer);

    product.productImage[index] = `/uploads/products/${fileName}`;
    await product.save();

    if (oldImagePath && fs.existsSync(oldImagePath)) fs.unlinkSync(oldImagePath);

    const responseData = {
      success: true,
      message: "Image updated successfully",
      imageUrl: `/uploads/products/${fileName}`
    }

    res.status(HTTP_STATUS.OK).json(responseData);
  } catch (error) {
    next(error);
  }
};

// ------------------------- Load Edit Product -------------------------

const loadEditProduct = async (req, res, next) => {
  try {
    const productId = req.query.id;
    const product = await Product.findById(productId).lean().populate("category");
    const categories = await Category.find({ isDeleted: false }).lean();

    if (!product) {
      return res.redirect("/admin/products");
    }

    res.status(HTTP_STATUS.OK).render("edit-product", { product, categories });
  } catch (error) {
    next(error);
  }
};

// -------------------------- Edit Product ----------------------------

const editProduct = async (req, res, next) => {
  try {
    const { _id, productName, description, basePrice, salePrice, brand, category } = req.body;

    if (!_id) {
      const categories = await Category.find();
      return res.status(HTTP_STATUS.BAD_REQUEST).render("edit-product", {
        product: null,
        categories,
        error: "Product ID is missing."
      });
    }

    const product = await Product.findById(_id);
    if (!product) {
      return res.status(HTTP_STATUS.NOT_FOUND).render("edit-product", {
        product: null,
        categories: await Category.find(),
        error: "Product not found."
      });
    }

    if (parseFloat(salePrice) >= parseFloat(basePrice)) {
      const categories = await Category.find({ isDeleted: false });
      return res.status(HTTP_STATUS.BAD_REQUEST).render("edit-product", {
        categories,
        product,
        error: "Sale price must be less than base price."
      });
    }

    Object.assign(product, { productName, description, basePrice, salePrice, brand, category });
    await product.save();

    const updatedProduct = await Product.findById(_id).populate("category").lean();
    const categories = await Category.find({ isDeleted: false }).lean();

    const responseData = {
      product: updatedProduct,
      categories,
      success: "Product updated successfully!"
    }

    res.status(HTTP_STATUS.OK).render("edit-product", responseData);
  } catch (error) {
    next(error);
  }
};

// ------------------------ Delete Product Image --------------------------

const deleteProductImage = async (req, res, next) => {
  try {
    const { productId, imageIndex } = req.body;
    const product = await Product.findById(productId);
    if (!product) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Product not found" });

    const index = parseInt(imageIndex);
    if (isNaN(index) || index < 0 || index >= product.productImage.length) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Invalid image index" });
    }

    product.productImage.splice(index, 1);
    await product.save();

    res.status(HTTP_STATUS.OK).json({ success: true, message: "Image deleted successfully" });
  } catch (error) {
    next(error);
  }
};

// ------------------------ Add Product Image --------------------------

const addProductImage = async (req, res, next) => {
  try {
    const { productId } = req.body;
    if (!productId || !req.file) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Invalid data." });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Product not found." });
    }

    const fileName = `${uuidv4()}.jpeg`;
    const filePath = path.join(process.cwd(), "public", "uploads", "products", fileName);

    await sharp(req.file.buffer)
      .resize(500, 500)
      .toFormat("jpeg")
      .jpeg({ quality: 90 })
      .toFile(filePath);

    const imageUrl = `/uploads/products/${fileName}`;
    product.productImage.push(imageUrl);
    await product.save();

    const responseData = {
      success: true,
      message: "Image added successfully",
      imageUrl
    }

    res.status(HTTP_STATUS.CREATED).json(responseData);
  } catch (error) {
    next(error);
  }
};

////////////////////////////////////////////////////////////////////////////////////////

module.exports = {
  addProduct,
  loadAddProduct,
  loadProducts,
  loadEditProduct,
  editProduct,
  deleteProductImage,
  updateProductImage,
  addProductImage,
  toggleBlockProduct

}
