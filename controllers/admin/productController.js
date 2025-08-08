
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');




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
      $and: [
        { isBlock: false },
        ...(search ? [{
          $or: [
            { productName: { $regex: search, $options: "i" } },
            { brand: { $regex: search, $options: "i" } },
            { "categoryData.name": { $regex: search, $options: "i" } }
          ]
        }] : [])
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
      { $match: matchStage },
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
      { $match: matchStage },
      { $count: "total" }
    ]);

    const total = countAggregate[0] ? countAggregate[0].total : 0;
    const categories = await Category.find({ isDeleted: false });

    const msg = req.query.msg;


    res.render("list-products", {
      data: products,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      search,
      categories,
      msg
    });

  } catch (error) {
    console.log("error", error);
    res.status(500).send("Internal Server Error");
  }
};


////////////////////////////////////////////////////////////////////////////////////////////


const softDeleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    await Product.findByIdAndUpdate(id, { isBlock: true });

    res.json({ success: true });

  } catch (error) {
    console.error("Soft delete error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


///////////////////////////////////////////////////////////////////////////////////////

const updateProductImage = async (req, res) => {
  try {
    const { productId, index } = req.body;

    if (!productId || typeof index === 'undefined' || !req.file) {
      return res.json({ success: false, message: 'Invalid data.' });
    }

    // Find product
    const product = await Product.findById(productId);
    if (!product) {
      return res.json({ success: false, message: 'Product not found.' });
    }

    // Store old image path for deletion
    const oldImagePath = product.productImage[index]
      ? path.join(__dirname, '../public', product.productImage[index])
      : null;

    // Save new image from buffer
    const fileName = `${uuidv4()}.png`;
    const filePath = path.join(process.cwd(), 'public', 'uploads', 'products', fileName);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    fs.writeFileSync(filePath, req.file.buffer);

    // Update the product image path in DB
    product.productImage[index] = `/uploads/products/${fileName}`;
    await product.save();

    // Delete old file if it exists
    if (oldImagePath && fs.existsSync(oldImagePath)) {
      fs.unlinkSync(oldImagePath);
    }

    res.json({ success: true, message: 'Image updated successfully', imageUrl: `/uploads/products/${fileName}` });

  } catch (error) {
    console.error('Error updating image:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

///////////////////////////////////////////////////////////////////////////////////////////////////

const loadEditProduct = async (req, res) => {
  try {

    const productId = req.query.id; // Pass ID in query like ?id=xyz

    const product = await Product.findById(productId).lean().populate('category');
    const categories = await Category.find().lean();


    if (!product) {
      return res.redirect('/admin/products'); // or handle gracefully
    }

    res.render('edit-product', {
      product,
      categories,

    });

  } catch (error) {
    res.redirect('/pageerror');
  }

}

/////////////////////////////////////////////////////////////////////////////////////////////////////

const editProduct = async (req, res) => {
  try {
    const { _id, productName, description, basePrice, salePrice, brand, category } = req.body;

    if (!_id) {
      const categories = await Category.find();
      return res.render('edit-product', {
        product: null,
        categories,
        error: 'Product ID is missing.'
      });
    }

    const product = await Product.findById(_id);

    if (!product) {
      return res.render('edit-product', {
        product: null,
        categories,
        error: 'Product not found.'
      });
    }
 

    // Update fields only (no image handling)
    product.productName = productName;
    product.description = description;
    product.basePrice = basePrice;
    product.salePrice = salePrice;
    product.brand = brand;
    product.category = category;

    await product.save();

    const updatedProduct = await Product.findById(_id).populate('category').lean();
    const categories = await Category.find().lean();

    return res.render('edit-product', {
      product: updatedProduct,
      categories,
      success: 'Product updated successfully!'
    });

  } catch (error) {
    console.error("Error updating product:", error.message);
    res.status(500).send("Internal Server Error");
  }
};


//////////////////////////////////////////////////////////////////////////////////////////////////



const deleteProductImage = async (req, res) => {
  try {
    const { productId, imageIndex } = req.body;

    const product = await Product.findById(productId);
    if (!product) return res.json({ success: false, message: 'Product not found' });

    const index = parseInt(imageIndex);
    if (isNaN(index) || index < 0 || index >= product.productImage.length) {
      return res.json({ success: false, message: 'Invalid image index' });
    }

    const removedImage = product.productImage.splice(index, 1)[0];

    // Optionally delete from filesystem / cloud:
    // Example for local filesystem:
    // const fs = require('fs');
    // const path = require('path');
    // fs.unlink(path.join(__dirname, '../public/' + removedImage), (err) => {});

    await product.save();

    res.json({ success: true, message: 'Image deleted successfully' });

  } catch (error) {
    console.error('Error deleting image:', error.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};


//////////////////////////////////////////////////////////////////////////////////////////////////

const addProductImage = async (req, res) => {
  try {
    const { productId } = req.body;
    if (!productId || !req.file) {
      return res.json({ success: false, message: 'Invalid data.' });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.json({ success: false, message: 'Product not found.' });
    }

    const fileName = `${uuidv4()}.jpeg`;
    const filePath = path.join(process.cwd(), 'public', 'uploads', 'products', fileName);

    // Resize and save
    await sharp(req.file.buffer)
      .resize(500, 500)
      .toFormat('jpeg')
      .jpeg({ quality: 90 })
      .toFile(filePath);

    const imageUrl = `/uploads/products/${fileName}`;
    product.productImage.push(imageUrl);
    await product.save();

    res.json({ success: true, message: 'Image added successfully', imageUrl });
  } catch (error) {
    console.error('Error adding image:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

////////////////////////////////////////////////////////////////////////////////////////
module.exports = {
  addProduct,
  loadAddProduct,
  loadProducts,
  softDeleteProduct,
  loadEditProduct,
  editProduct,
  deleteProductImage,
  updateProductImage,
  addProductImage

}
