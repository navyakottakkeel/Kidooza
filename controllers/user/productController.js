const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const User = require('../../models/userSchema');


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
        const perPage = 6;
        const page = parseInt(req.query.page) || 1;

        const {
            search = '',
            sort = '',
            category,
            minPrice,
            maxPrice
        } = req.query;

        let user = null;
        if (req.user) {
            user = req.user;
        } else if (req.session.user) {
            user = await User.findById(req.session.user);
        }

        // ✅ Static values for sidebar filters (used only for rendering UI)
        const brands = await Product.distinct("brand");
        const staticAges = ['0-2', '3-5', '6-8', '9-12'];
        const staticColors = ['Red', 'Blue', 'Green', 'Black', 'White'];

        // ✅ Only apply filters that actually exist in Product model
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


        if (minPrice || maxPrice) {
            filter.salePrice = {};
            if (minPrice) filter.salePrice.$gte = Number(minPrice);
            if (maxPrice) filter.salePrice.$lte = Number(maxPrice);
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

        const totalProducts = await Product.countDocuments(filter);

        const allProducts = await Product.find(filter)
            .populate("category")
            .sort(sortOption)
            .skip((page - 1) * perPage)
            .limit(perPage);

        const categories = await Category.find({ isDeleted: false });

        // Group products by category
        const categorizedProducts = {};
        categories.forEach(cat => {
            console.log("Processing category:", cat.name);
            categorizedProducts[cat._id] = allProducts.filter(prod => {
              if (!prod.category || !prod.category._id) {
                console.log("Missing category in product:", prod.productName);
                return false;
              }
              return prod.category._id.toString() === cat._id.toString();
            });
          });
          


        res.locals.user = user;

        res.render("boys", {
            categories,
            allProducts,
            categorizedProducts,
            brands,
            ages: staticAges,
            colors: staticColors,
            currentPage: page,
            totalPages: Math.ceil(totalProducts / perPage),
            search,
            sort,
            filters: { category, minPrice, maxPrice } // Only send real filters
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



module.exports = {
    loadAllProducts,
    loadNewArrivals,
    loadBoysPage
}