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
  
      let filter = { isBlock: false };
      const perPage = 9;
      const page = parseInt(req.query.page) || 1;
  
      let { search = '', sort = '', category, minPrice, maxPrice } = req.query;
  
      // sanitize input
      sort = Array.isArray(sort) ? sort[0].trim() : sort.trim();
      search = Array.isArray(search) ? search.filter(s => s.trim() !== '')[0] || '' : search;
  
      const brands = await Product.distinct("brand");
      const colours = await Variant.distinct("colour");
      const size = await Variant.distinct("size");
  
      if (search) filter.$or = [{ productName: { $regex: search, $options: 'i' } }, { description: { $regex: search, $options: 'i' } }];
      if (category) {
        const categoryDocs = await Category.find({ name: { $in: Array.isArray(category) ? category : [category] } });
        filter.category = { $in: categoryDocs.map(c => c._id) };
      }
  
      if (req.query.brand) filter.brand = { $in: Array.isArray(req.query.brand) ? req.query.brand : [req.query.brand] };
  
      // Variant filters
      const selectedColours = req.query.colour ? (Array.isArray(req.query.colour) ? req.query.colour : [req.query.colour]) : [];
      const selectedSizes = req.query.size ? (Array.isArray(req.query.size) ? req.query.size : [req.query.size]) : [];
  
      if (selectedColours.length > 0 || selectedSizes.length > 0) {
        const variantFilter = {};
        if (selectedColours.length) variantFilter.colour = { $in: selectedColours };
        if (selectedSizes.length) variantFilter.size = { $in: selectedSizes };
        const variantProductIds = await Variant.distinct("productId", variantFilter);
        filter._id = variantProductIds.length > 0 ? { $in: variantProductIds } : { $in: [] };
      }
  
      // Price filter
      if (!isNaN(minPrice) || !isNaN(maxPrice)) {
        filter.salePrice = {};
        if (!isNaN(minPrice)) filter.salePrice.$gte = parseInt(minPrice);
        if (!isNaN(maxPrice)) filter.salePrice.$lte = parseInt(maxPrice);
      }
  
      // Ensure products have variants
      const productsWithVariants = await Variant.distinct("productId");
      filter._id = filter._id?.$in
        ? { $in: filter._id.$in.filter(id => productsWithVariants.includes(id.toString())) }
        : { $in: productsWithVariants };
  
      // Sorting
      const sortOption = sort === 'price-asc' ? { salePrice: 1 } :
                         sort === 'price-desc' ? { salePrice: -1 } :
                         sort === 'name-asc' ? { productName: 1 } :
                         sort === 'name-desc' ? { productName: -1 } :
                         { createdAt: -1 };
  
      const totalProducts = await Product.countDocuments(filter);
      let allProducts = await Product.find(filter)
        .populate("category")
        .sort(sortOption)
        .skip((page - 1) * perPage)
        .limit(perPage);
  
      allProducts = await applyOfferToProducts(allProducts);
  
      // Process variants & wishlist
      for (const product of allProducts) {
        const variants = await Variant.find({ productId: product._id }).lean();
        const groupedByColour = {};
        variants.forEach(v => {
          groupedByColour[v.colour] = groupedByColour[v.colour] || { colour: v.colour, image: v.productImage[0], sizes: [] };
          groupedByColour[v.colour].sizes.push({ id: v._id, size: v.size, stock: v.stock, image: v.productImage[0] });
        });
        product.variantsByColour = Object.values(groupedByColour);
        product.defaultImage = product.variantsByColour[0]?.image;
  
        if (req.user && product.variantsByColour[0]?.sizes.length > 0) {
          const wishlistItem = await Wishlist.findOne({
            userId: req.user._id,
            "items.variantId": product.variantsByColour[0].sizes[0].id
          });
          product.inWishlist = !!wishlistItem;
        }
      }
  
      const categories = await Category.find({ isDeleted: false });
      const categorizedProducts = {};
      categories.forEach(cat => {
        categorizedProducts[cat._id] = allProducts.filter(prod => prod.category?._id?.toString() === cat._id.toString());
      });
  
      const queryObj = { ...req.query };
      delete queryObj.page;
      const baseQuery = new URLSearchParams(queryObj).toString();
  
      res.locals.user = user;
  
      return res.status(HTTP_STATUS.OK).render("boys", {
        categories,
        allProducts,
        categorizedProducts,
        brands,
        colours,
        size,
        currentPage: page,
        totalPages: Math.ceil(totalProducts / perPage),
        search,
        sort,
        baseQuery,
        filters: {
          category,
          brand: req.query.brand,
          size: req.query.size,
          colour: selectedColours,
          minPrice,
          maxPrice
        },
        wishlistItems: user ? (await Wishlist.findOne({ userId })).items.map(item => ({
          productId: item.productId?.toString() || null,
          colour: item.colour || null
        })) : []
      });
  
    } catch (error) {
       next(error);
    }
  };

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
        const error = new Error("Product not found");
        error.status = HTTP_STATUS.NOT_FOUND;
        throw error;
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
  
      const relatedProducts = await Product.find({
        category: product.category._id,
        _id: { $ne: productId }
      }).limit(5);
  
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

// -------------------------- Load All Products --------------------------------------------

const loadAllProducts = async (req, res, next) => {
    try {
      const perPage = 8;
      const page = parseInt(req.query.page) || 1;
  
      let user = req.user || (req.session.user && await User.findById(req.session.user));
      const categories = await Category.find({ isDeleted: false });
  
      const totalProducts = await Product.countDocuments({ isBlock: false });
      const allProducts = await Product.find({ isBlock: false })
        .populate("category")
        .skip((page - 1) * perPage)
        .limit(perPage);
  
      const categorizedProducts = {};
      categories.forEach(category => {
        categorizedProducts[category._id] = allProducts.filter(
          product => product.category?._id?.toString() === category._id.toString()
        );
      });
  
      res.locals.user = user;
  
      return res.status(HTTP_STATUS.OK).render("all-products", {
        categories,
        allProducts,
        categorizedProducts,
        currentPage: page,
        totalPages: Math.ceil(totalProducts / perPage)
      });
  
    } catch (error) {
     next(error); 
    }
  };

  // -------------------------- Load New Arrivals --------------------------------------------

const loadNewArrivals = async (req, res) => {
    try {
        const perPage = 8;
        const page = parseInt(req.query.page) || 1;
    
        let user = req.user || (req.session.user && await User.findById(req.session.user));
        const categories = await Category.find({ isDeleted: false });
    
        const totalProducts = await Product.countDocuments({ isBlock: false });
        const allProducts = await Product.find({ isBlock: false })
          .populate("category")
          .skip((page - 1) * perPage)
          .limit(perPage);
    
        const categorizedProducts = {};
        categories.forEach(category => {
          categorizedProducts[category._id] = allProducts.filter(
            product => product.category?._id?.toString() === category._id.toString()
          );
        });
    
        res.locals.user = user;
    
        return res.status(HTTP_STATUS.OK).render("new-arrivals", {
          categories,
          allProducts,
          categorizedProducts,
          currentPage: page,
          totalPages: Math.ceil(totalProducts / perPage)
        });
    
      } catch (error) {
       next(error); 
      }
}


///////////////////////////////////////////////////////////////////////////////////////////

module.exports = {
    loadAllProducts,
    loadNewArrivals,
    loadBoysPage,
    loadProductDetail,
}