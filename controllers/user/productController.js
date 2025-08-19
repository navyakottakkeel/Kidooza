const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const User = require('../../models/userSchema');
const Varient = require('../../models/varientSchema');
const Wishlist = require('../../models/wishlistSchema');

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




const loadBoysPage = async (req, res) => {
    try {

        
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
            const wishlist = await Wishlist.findOne({ userId: user._id });
            if (wishlist) {
                wishlistItems = wishlist.items.map(item => ({
                    productId: item.productId.toString(),
                    variantId: item.variantId.toString()
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
        const colours = await Varient.distinct("colour");
        const size = await Varient.distinct("size");


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

        // Apply variant filters
        if (selectedColours.length > 0 || selectedSizes.length > 0) {
            const variantFilter = {};

            if (selectedColours.length > 0) {
                variantFilter.colour = { $in: selectedColours };
            }

            if (selectedSizes.length > 0) {
                variantFilter.size = { $in: selectedSizes };
            }

            const variantProductIds = await Varient.find(variantFilter).distinct("productId");

            // If no matching variants, set filter to empty array to return no products
            if (variantProductIds.length === 0) {
                filter._id = { $in: [] }; // No matches
            } else {
                filter._id = { $in: variantProductIds };
            }
        }

        // Price filter
        if (!isNaN(minPrice) || !isNaN(maxPrice)) {
            filter.salePrice = {};
            if (!isNaN(minPrice)) filter.salePrice.$gte = parseInt(minPrice);
            if (!isNaN(maxPrice)) filter.salePrice.$lte = parseInt(maxPrice);
        }


        // 🔹 Ensure product has at least one variant
        const productsWithVariants = await Varient.distinct("productId");
        filter._id = filter._id
            ? { $in: filter._id.$in.filter(id => productsWithVariants.includes(id)) }
            : { $in: productsWithVariants };


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

        const allProducts = await Product.find(filter)
            .populate("category")
            .sort(sortOption)
            .skip((page - 1) * perPage)
            .limit(perPage);


        // Attach defaultVariantId
        for (let product of allProducts) {
            const variant = await Varient.findOne({ productId: product._id }).lean();
            product.defaultVariantId = variant ? variant._id : null;
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
        res.status(500).send("Server error");
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

const loadProductDetail = async (req, res) => {
    try {
        let user = null;
        if (req.user) {
            user = req.user;
        } else if (req.session.user) {
            user = await User.findById(req.session.user);
        }


        let wishlistItems = [];
        if (user) {
            const wishlist = await Wishlist.findOne({ userId: user._id });
            if (wishlist) {
                wishlistItems = wishlist.items.map(item => ({
                    productId: item.productId.toString(),
                    variantId: item.variantId.toString()
                }));
            }
        }


        const productId = req.params.id;

        const product = await Product.findById(productId).populate("category");
        const [colours, sizes] = await Promise.all([
            Varient.distinct('colour', { productId }),
            Varient.distinct('size', { productId }),
        ]);

        const variants = await Varient.find({ productId: productId }).select('size colour stock basePrice salePrice productImage');



        if (!product) {
            return res.status(404).send("Product not found");
        }

        res.locals.user = user;


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


        res.render('product-detail', {
            product,
            colours,
            sizes: [...new Set(variants.map(v => v.size))],
            discountPercent,
            relatedProducts,
            variants,
            wishlistItems
        });

    } catch (error) {
        console.error("Error loading product detail:", error.message);
        res.status(500).send("Server error");
    }
};


////////////////////////////////////////////////////////////////////////////////////////////




///////////////////////////////////////////////////////////////////////////////////////////

module.exports = {
    loadAllProducts,
    loadNewArrivals,
    loadBoysPage,
    loadProductDetail,
}