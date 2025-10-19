const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const User = require('../../models/userSchema');
const Variant = require('../../models/variantSchema');
const Wishlist = require('../../models/wishlistSchema');
const Offer = require("../../models/offerSchema");
const HTTP_STATUS = require("../../constants/httpStatus");


const url = require("url");

// -------------------------- Helper Apply Offer To Products ---------------------------------------

async function applyOfferToProducts(products) {
  const now = new Date();
  return Promise.all(products.map(async product => {
    let originalDiscountPercent = 0;
    if (product.basePrice > product.salePrice) {
      originalDiscountPercent = Math.round(((product.basePrice - product.salePrice) / product.basePrice) * 100);
    }

    const offers = await Offer.find({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
      $or: [
        { type: "Product", productId: product._id },
        { type: "Category", categoryId: product.category?._id }
      ]
    });

    if (offers.length > 0) {
      const bestOffer = offers.reduce((prev, curr) => curr.discountPercentage > prev.discountPercentage ? curr : prev);
      const originalDiscountAmount = (product.basePrice * originalDiscountPercent) / 100;
      const offerDiscountAmount = (product.basePrice * bestOffer.discountPercentage) / 100;
      const totalDiscount = originalDiscountAmount + offerDiscountAmount;

      product.salePrice = product.basePrice - totalDiscount;
      product.totalDiscountPercent = originalDiscountPercent + bestOffer.discountPercentage;
      product.appliedOffer = bestOffer;
    } else {
      product.totalDiscountPercent = originalDiscountPercent;
      product.appliedOffer = null;
    }

    return product;
  }));
}

// -------------------------- Load Boys Page --------------------------------------------


const loadBoysPage = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.session.user;
    const user = req.user || (req.session.user && await User.findById(req.session.user));
    res.locals.user = user;

    let filter = { isBlock: false };
    const perPage = 6;
    const page = parseInt(req.query.page) || 1;

    let { search = '', sort = '', category, minPrice, maxPrice } = req.query;

    sort = Array.isArray(sort) ? sort[0].trim() : sort.trim();
    search = Array.isArray(search) ? search.filter(s => s.trim() !== '')[0] || '' : search;

    const brands = await Product.distinct("brand");
    const colours = await Variant.distinct("colour");
    const sizes = await Variant.distinct("size");

    // ---------------- Search ----------------
    if (search) {
      filter.$or = [
        { productName: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // ---------------- Category ----------------
    if (category) {
      const categoryDocs = await Category.find({
        name: { $in: Array.isArray(category) ? category : [category] }
      });
      if (categoryDocs.length > 0) {
        filter.category = { $in: categoryDocs.map(c => c._id) };
      }
    }

    // ---------------- Brand ----------------
    if (req.query.brand) {
      filter.brand = {
        $in: Array.isArray(req.query.brand) ? req.query.brand : [req.query.brand]
      };
    }
  
    // ---------------- Variant Filters (Colour & Size) ----------------
    const selectedColours = req.query.colour
      ? (Array.isArray(req.query.colour) ? req.query.colour : [req.query.colour])
      : [];
    const selectedSizes = req.query.size
      ? (Array.isArray(req.query.size) ? req.query.size : [req.query.size])
      : [];

    // Normalize to lowercase for consistent matching
    const normalizedColours = selectedColours.map(c => c.toLowerCase());
    const normalizedSizes = selectedSizes.map(s => s.toLowerCase());

    let variantQuery = {};
    if (normalizedColours.length > 0) {
      variantQuery.colour = { $in: normalizedColours };
    }
    if (normalizedSizes.length > 0) {
      variantQuery.size = { $in: normalizedSizes };
    }

    if (Object.keys(variantQuery).length > 0) {
      // convert all stored variant colours/sizes to lowercase in query
      const variants = await Variant.aggregate([
        {
          $addFields: {
            colourLower: { $toLower: "$colour" },
            sizeLower: { $toLower: "$size" }
          }
        },
        {
          $match: {
            ...(normalizedColours.length > 0 ? { colourLower: { $in: normalizedColours } } : {}),
            ...(normalizedSizes.length > 0 ? { sizeLower: { $in: normalizedSizes } } : {})
          }
        },
        {
          $group: { _id: "$productId" }
        }
      ]);

      const variantProductIds = variants.map(v => v._id);

      if (variantProductIds.length === 0) {
        // Return empty if no variant matches
        return res.render("boys", {
          categories: await Category.find({ isDeleted: false }),
          allProducts: [],
          categorizedProducts: {},
          brands,
          colours,
          size: sizes,
          currentPage: 1,
          totalPages: 1,
          search,
          sort,
          baseQuery: '',
          filters: {
            category,
            brand: req.query.brand,
            size: selectedSizes,
            colour: selectedColours,
            minPrice,
            maxPrice
          },
          wishlistItems: []
        });
      }

      // Merge with existing filter
      if (filter._id && filter._id.$in) {
        filter._id.$in = filter._id.$in.filter(id =>
          variantProductIds.some(vid => vid.toString() === id.toString())
        );
      } else {
        filter._id = { $in: variantProductIds };
      }
    }

    // ---------------- Price Filter ----------------
    if (!isNaN(minPrice) || !isNaN(maxPrice)) {
      filter.salePrice = {};
      if (!isNaN(minPrice)) filter.salePrice.$gte = parseInt(minPrice);
      if (!isNaN(maxPrice)) filter.salePrice.$lte = parseInt(maxPrice);
    }

    // ---------------- Ensure Products Have Variants ----------------
    const productsWithVariants = await Variant.distinct("productId");
    if (filter._id && filter._id.$in) {
      filter._id.$in = filter._id.$in.filter(id =>
        productsWithVariants.some(pid => pid.toString() === id.toString())
      );
    } else {
      filter._id = { $in: productsWithVariants };
    }

    // ---------------- Sorting ----------------
    const sortOption =
      sort === 'price-asc' ? { salePrice: 1 } :
      sort === 'price-desc' ? { salePrice: -1 } :
      sort === 'name-asc' ? { productName: 1 } :
      sort === 'name-desc' ? { productName: -1 } :
      { createdAt: -1 };

    // ---------------- Fetch Products ----------------
    const totalProducts = await Product.countDocuments(filter);
    let allProducts = await Product.find(filter)
      .populate("category")
      .sort(sortOption)
      .skip((page - 1) * perPage)
      .limit(perPage);

    allProducts = await applyOfferToProducts(allProducts);

    // ---------------- Process Variants ----------------
    for (const product of allProducts) {
      const variants = await Variant.find({ productId: product._id }).lean();
      const groupedByColour = {};

      variants.forEach(v => {
        const lowerColour = v.colour.toLowerCase();
        if (!groupedByColour[lowerColour]) {
          groupedByColour[lowerColour] = {
            colour: v.colour,
            image: v.productImage[0],
            sizes: []
          };
        }
        groupedByColour[lowerColour].sizes.push({
          id: v._id,
          size: v.size,
          stock: v.stock,
          image: v.productImage[0]
        });
      });

      product.variantsByColour = Object.values(groupedByColour);
      product.defaultImage = product.variantsByColour[0]?.image;
    }

    const categories = await Category.find({ isDeleted: false });
    const categorizedProducts = {};
    categories.forEach(cat => {
      categorizedProducts[cat._id] = allProducts.filter(
        prod => prod.category?._id?.toString() === cat._id.toString()
      );
    });

    const queryObj = { ...req.query };
    delete queryObj.page;
    const baseQuery = buildQueryString(req.query);

    const wishlistDoc = user ? await Wishlist.findOne({ userId }) : null;
    const wishlistItems = wishlistDoc
      ? wishlistDoc.items.map(item => ({
          productId: item.productId?.toString() || null,
          colour: item.colour || null
        }))
      : [];

    return res.status(HTTP_STATUS.OK).render("boys", {
      categories,
      allProducts,
      categorizedProducts,
      brands,
      colours,
      size: sizes,
      currentPage: page,
      totalPages: Math.ceil(totalProducts / perPage),
      search,
      sort,
      baseQuery,
      filters: {
        category,
        brand: req.query.brand,
        size: selectedSizes,
        colour: selectedColours,
        minPrice,
        maxPrice
      },
      wishlistItems
    });
  } catch (error) {
    next(error);
  }
};

//------------------

function buildQueryString(query) {
  const params = [];
  for (const key in query) {
    if (key === 'page') continue;
    const value = query[key];
    if (Array.isArray(value)) {
      value.forEach(v => params.push(`${key}=${encodeURIComponent(v)}`));
    } else if (value) {
      params.push(`${key}=${encodeURIComponent(value)}`);
    }
  }
  return params.join('&');
}
// -------------------------- Helper Apply Offer To Variants --------------------------------

async function applyOfferToVariants(variants, product) {

  const now = new Date();

  return Promise.all(variants.map(async variant => {
    let originalDiscountPercent = 0;
    if (variant.basePrice > variant.salePrice) {
      originalDiscountPercent = Math.round(((variant.basePrice - variant.salePrice) / variant.basePrice) * 100);
    }

    // Find active offers for this variant's product or category
    const offers = await Offer.find({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
      $or: [
        { type: "Product", productId: product._id },
        { type: "Category", categoryId: product.category?._id }
      ]
    });

    if (offers.length > 0) {
      const bestOffer = offers.reduce((prev, curr) =>
        curr.discountPercentage > prev.discountPercentage ? curr : prev
      );

      const originalDiscountAmount = (variant.basePrice * originalDiscountPercent) / 100;
      const offerDiscountAmount = (variant.basePrice * bestOffer.discountPercentage) / 100;
      const totalDiscount = originalDiscountAmount + offerDiscountAmount;

      variant.salePrice = variant.basePrice - totalDiscount;
      variant.totalDiscountPercent = originalDiscountPercent + bestOffer.discountPercentage;
      variant.appliedOffer = bestOffer;

    } else {
      variant.totalDiscountPercent = originalDiscountPercent;
      variant.appliedOffer = null;
    }

    return variant;
  }));
}

// -------------------------- Load Product Detail --------------------------------------------

const loadProductDetail = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.session.user;
    const user = req.user || (req.session.user && await User.findById(req.session.user));
    res.locals.user = user;

    let wishlistItems = [];
    if (user) {
      const wishlist = await Wishlist.findOne({ userId });
      if (wishlist) {
        wishlistItems = wishlist.items.map(item => ({
          productId: item.productId?.toString() || null,
          variantId: item.variantId?.toString() || null
        }));
      }
    }

    const productId = req.params.id;
    const product = await Product.findById(productId).populate("category");

    if (!product) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Product not found'
    });
    }

    const [colours, sizes] = await Promise.all([
      Variant.distinct('colour', { productId }),
      Variant.distinct('size', { productId })
    ]);

    let variants = await Variant.find({ productId }).select('size colour stock basePrice salePrice productImage');
    variants = await applyOfferToVariants(variants, product);

    const originalPrice = product.basePrice;
    const sellingPrice = product.salePrice;
    const discountPercent = originalPrice > sellingPrice ? Math.round(((originalPrice - sellingPrice) / originalPrice) * 100) : 0;

    let relatedProducts = await Product.find({
      category: product.category._id,
      isBlock: false,
      _id: { $ne: productId }
    }).limit(5);

    relatedProducts = await applyOfferToProducts(relatedProducts);


    const defaultVariant = variants[0];

    return res.status(HTTP_STATUS.OK).render('product-detail', {
      product,
      colours,
      sizes: [...new Set(variants.map(v => v.size))],
      discountPercent,
      relatedProducts,
      variants,
      wishlistItems,
      defaultVariant
    });

  } catch (error) {
    next(error);
  }
};

///////////////////////////////////////////////////////////////////////////////////////////

module.exports = {
  loadBoysPage,
  loadProductDetail,
}