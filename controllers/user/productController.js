const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const User = require('../../models/userSchema');
const Variant = require('../../models/variantSchema');
const Wishlist = require('../../models/wishlistSchema');
const Offer = require("../../models/offerSchema");


const url = require("url");


const loadAllProducts = async (req, res) => {
    try {
        const perPage = 8;
        const page = parseInt(req.query.page) || 1;

        let user = null;
        if (req.user) {
            user = req.user;
        } else if (req.session.user) {
            user = await User.findById(req.session.user);
        }

        const categories = await Category.find({ isDeleted: false });

        // Get total product count
        const totalProducts = await Product.countDocuments({ isBlock: false });

        // Paginate products
        const allProducts = await Product.find({ isBlock: false })
            .populate("category")
            .skip((page - 1) * perPage)
            .limit(perPage);


        // Group products by category
        const categorizedProducts = {};
        categories.forEach(category => {
            categorizedProducts[category._id] = allProducts.filter(
                product => product.category?._id?.toString() === category._id.toString()
            );
        });

        res.locals.user = user;

        res.render("all-products", {
            categories,
            allProducts,
            categorizedProducts,
            currentPage: page,
            totalPages: Math.ceil(totalProducts / perPage)
        });

    } catch (error) {
        console.error("Error loading all products:", error);
        res.status(500).send("Server error");
    }
};


///////////////////////////////////////////////////////////////////////////////////


async function applyOfferToProducts(products) {
    const now = new Date();
  
    return Promise.all(products.map(async product => {
      // Calculate original discount based on basePrice & current salePrice
      let originalDiscountPercent = 0;
      if (product.basePrice > product.salePrice) {
        originalDiscountPercent = Math.round(
          ((product.basePrice - product.salePrice) / product.basePrice) * 100
        );
      }
  
      // Find active offers for this product or its category
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
        // Pick the offer with the highest discount
        const bestOffer = offers.reduce((prev, curr) => 
          curr.discountPercentage > prev.discountPercentage ? curr : prev
        );
  
        // Apply best offer on the base price to calculate new salePrice
        const originalDiscountAmount = (product.basePrice * originalDiscountPercent) / 100;
        const offerDiscountAmount = (product.basePrice * bestOffer.discountPercentage) / 100;
        const totalDiscount = originalDiscountAmount + offerDiscountAmount
        product.salePrice = product.basePrice - totalDiscount;
  
        // Total discount percent (original + applied offer)
        product.totalDiscountPercent = originalDiscountPercent + bestOffer.discountPercentage;
        product.appliedOffer = bestOffer;
  
      } else {
        product.totalDiscountPercent = originalDiscountPercent;
        product.appliedOffer = null;
      }
  
      return product;
    }));
  }
  



const loadBoysPage = async (req, res) => {
    try {

        const userId = req.user ? req.user._id : req.session.user;

        let user = null;
        if (req.user) {
            user = req.user;
        } else if (req.session.user) {
            user = await User.findById(req.session.user);
        }

        productQuery = { isBlock: false }

        const products = await Product.find(productQuery);
        
        let wishlistItems = [];
        if (user) {
            const wishlist = await Wishlist.findOne({ userId }).lean();
            if (wishlist) {
                wishlistItems = wishlist.items.map(item => ({
                    productId: item.productId ? item.productId.toString() : null,
                    colour: item.colour || null  
                }));
            }
        }

        const perPage = 6;
        const page = parseInt(req.query.page) || 1;

        let {
            search = '',
            sort = '',
            category,
            minPrice,
            maxPrice
        } = req.query;

        if (Array.isArray(sort)) {
            sort = sort[0];
        }
        sort = sort.trim();

        if (Array.isArray(search)) {
            search = search.filter(s => s.trim() !== '')[0] || '';
        }

        const brands = await Product.distinct("brand");
        const colours = await Variant.distinct("colour");
        const size = await Variant.distinct("size");
        const filter = { isBlock: false };

        if (search) {
            const regex = { $regex: search, $options: 'i' };
            filter.$or = [
                { productName: regex },
                { description: regex }
            ];
        }
        if (category) {
            const categoryDocs = await Category.find({ name: { $in: Array.isArray(category) ? category : [category] } });
            const categoryIds = categoryDocs.map(cat => cat._id);
            filter.category = { $in: categoryIds };
        }
        // Brand filter
        if (req.query.brand) {
            const brands = Array.isArray(req.query.brand) ? req.query.brand : [req.query.brand];
            filter.brand = { $in: brands };
        }

        // Handle variant-based filters: colour and size
        let variantColourProductIds = null;
        let variantSizeProductIds = null;

        const selectedColours = req.query.colour ? (Array.isArray(req.query.colour) ? req.query.colour : [req.query.colour]) : [];
        const selectedSizes = req.query.size ? (Array.isArray(req.query.size) ? req.query.size : [req.query.size]) : [];

        let variantFilteredIds = null;
        let variantProductIds = null;


        // Apply variant filters
        if (selectedColours.length > 0 || selectedSizes.length > 0) {
            const variantFilter = {};

            if (selectedColours.length > 0) {
                variantFilter.colour = { $in: selectedColours };
            }

            if (selectedSizes.length > 0) {
                variantFilter.size = { $in: selectedSizes };
            }

            const variantProductIds = await Variant.distinct("productId", variantFilter);

            if (variantProductIds.length > 0) {
                filter._id = { $in: variantProductIds };
            } else {
                filter._id = { $in: [] }; // no matches → return empty result
            }
        }



        // Price filter
        if (!isNaN(minPrice) || !isNaN(maxPrice)) {
            filter.salePrice = {};
            if (!isNaN(minPrice)) filter.salePrice.$gte = parseInt(minPrice);
            if (!isNaN(maxPrice)) filter.salePrice.$lte = parseInt(maxPrice);
        }


        // 🔹 Ensure product has at least one variant
        const productsWithVariants = await Variant.distinct("productId");

        if (filter._id && filter._id.$in) {
            // keep only products that both match colour/size AND have variants
            filter._id = { $in: filter._id.$in.filter(id => productsWithVariants.some(vId => vId.toString() === id.toString())) };
        } else {
            // no colour/size filter → just ensure they have variants
            filter._id = { $in: productsWithVariants };
        }

        // Sorting
        let sortOption = {};
        switch (sort) {
            case 'price-asc':
                sortOption.salePrice = 1;
                break;
            case 'price-desc':
                sortOption.salePrice = -1;
                break;
            case 'name-asc':
                sortOption.productName = 1;
                break;
            case 'name-desc':
                sortOption.productName = -1;
                break;
            default:
                sortOption.createdAt = -1;
        }

        // Pagination + product query
        const totalProducts = await Product.countDocuments(filter);

        let allProducts = await Product.find(filter)
            .populate("category")
            .sort(sortOption)
            .skip((page - 1) * perPage)
            .limit(perPage);

         allProducts = await applyOfferToProducts(allProducts);

        for (let product of allProducts) {

            const variants = await Variant.find({ productId: product._id }).lean();
            const groupedByColour = {};

            variants.forEach(v => {
                if (!groupedByColour[v.colour]) {
                    groupedByColour[v.colour] = {
                        colour: v.colour,
                        image: v.productImage[0], // default image for this colour
                        sizes: []
                    };
                }
            
                groupedByColour[v.colour].sizes.push({
                    id: v._id,
                    size: v.size,
                    stock: v.stock,
                    image: v.productImage[0]
                });
            });
            
            product.variantsByColour = Object.values(groupedByColour);
            
            // pick default image from first colour
            if (product.variantsByColour.length > 0) {
                product.defaultImage = product.variantsByColour[0].image;
            }
            
            // ✅ check if *any variant of first colour* is in wishlist
            if (req.user && product.variantsByColour[0].sizes.length > 0) {
                const wishlistItem = await Wishlist.findOne({
                    userId: req.user._id,
                    "items.variantId": product.variantsByColour[0].sizes[0].id
                });
            
                product.inWishlist = !!wishlistItem;
            }
            
        }

        const categories = await Category.find({ isDeleted: false });
        // Group products by category
        const categorizedProducts = {};
        categories.forEach(cat => {
            categorizedProducts[cat._id] = allProducts.filter(prod => {
                if (!prod.category || !prod.category._id) {
                    console.log("Missing category in product:", prod.productName);
                    return false;
                }
                return prod.category._id.toString() === cat._id.toString();
            });
        });


        res.locals.user = user;

        const queryObj = { ...req.query };
        delete queryObj.page;
        const baseQuery = new URLSearchParams(queryObj).toString();


        res.render("boys", {
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
            wishlistItems
        });

    } catch (error) {
        console.error("Error loading boys page:", error.message);
        res.status(500).send("Server error", error);
    }
};


///////////////////////////////////////////////////////////


const loadNewArrivals = async (req, res) => {
    try {
        const perPage = 8;
        const page = parseInt(req.query.page) || 1;

        let user = null;
        if (req.user) {
            user = req.user;
        } else if (req.session.user) {
            user = await User.findById(req.session.user);
        }

        const categories = await Category.find({ isDeleted: false });

        // Get total product count
        const totalProducts = await Product.countDocuments({ isBlock: false });

        // Paginate products
        const allProducts = await Product.find({ isBlock: false })
            .populate("category")
            .skip((page - 1) * perPage)
            .limit(perPage);

        // Group products by category
        const categorizedProducts = {};
        categories.forEach(category => {
            categorizedProducts[category._id] = allProducts.filter(
                product => product.category?._id?.toString() === category._id.toString()
            );
        });


        res.locals.user = user;

        res.render("new-arrivals", {
            categories,
            allProducts,
            categorizedProducts,
            currentPage: page,
            totalPages: Math.ceil(totalProducts / perPage)
        });

    } catch (error) {
        console.error("Error loading all products:", error);
        res.status(500).send("Server error");
    }
}


///////////////////////////////////////////////////////////////////////


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


const loadProductDetail = async (req, res) => {
    try {

        const userId = req.user ? req.user._id : req.session.user;

        let user = null;
        if (req.user) {
            user = req.user;
        } else if (req.session.user) {
            user = await User.findById(req.session.user);
        }

        res.locals.user = user;

        let wishlistItems = [];
        if (user) {
            const wishlist = await Wishlist.findOne({ userId });
            if (wishlist) {
                wishlistItems = wishlist.items.map(item => ({
                    productId: item.productId ? item.productId.toString() : null,
                    variantId: item.variantId ? item.variantId.toString() : null
                }));
            }
        }

        const productId = req.params.id;

        const product = await Product.findById(productId).populate("category");
        const [colours, sizes] = await Promise.all([
            Variant.distinct('colour', { productId }),
            Variant.distinct('size', { productId }),
        ]);

        let variants = await Variant.find({ productId: productId }).select('size colour stock basePrice salePrice productImage');

        variants = await applyOfferToVariants(variants, product);

        if (!product) {
            return res.status(404).send("Product not found");
        }


        const originalPrice = product.basePrice;
        const sellingPrice = product.salePrice;

        let discountPercent = 0;
        if (originalPrice > sellingPrice) {
            discountPercent = Math.round(((originalPrice - sellingPrice) / originalPrice) * 100);
        }

        const relatedProducts = await Product.find({
            category: product.category._id,
            _id: { $ne: productId },
        }).limit(5);

        const defaultVariant = variants[0];

        res.render('product-detail', {
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
        console.error("Error loading product detail:", error.message);
        res.status(500).send("Server error");
    }
};



///////////////////////////////////////////////////////////////////////////////////////////

module.exports = {
    loadAllProducts,
    loadNewArrivals,
    loadBoysPage,
    loadProductDetail,
}