const Product = require('../../models/productSchema');
const User = require('../../models/userSchema');
const Variant = require('../../models/variantSchema');
const Wishlist = require('../../models/wishlistSchema');



const addToWishlist = async (req, res) => {
    try {
        const { productId, variantId } = req.body;
        const userId = req.session.user; // assuming session holds user ID

        if (!productId || !variantId) {
            return res.status(400).json({ success: false, message: "Missing product or variant ID" });
        }

        let wishlist = await Wishlist.findOne({ userId });

        // If no wishlist yet, create one with this item
        if (!wishlist) {
            wishlist = new Wishlist({
                userId,
                items: [{ productId, variantId }]
            });
            await wishlist.save();
            return res.json({ success: true, action: "added" });
        }

        // Check if item already exists
        const itemIndex = wishlist.items.findIndex(item =>
            item.productId?.toString?.() === productId || item.productId?._id?.toString() === productId
                ? item.variantId?.toString?.() === variantId || item.variantId?._id?.toString() === variantId
                : false
        );


        if (itemIndex > -1) {
            // Exists → remove it
            wishlist.items.splice(itemIndex, 1);
            await wishlist.save();
            return res.json({ success: true, action: "removed", wishlistCount: wishlist.items.length });
        } else {
            // Not exists → add it
            wishlist.items.push({ productId, variantId });
            await wishlist.save();
            return res.json({ success: true, action: "added", wishlistCount: wishlist.items.length });
        }

        const wishlistCount = await Wishlist.aggregate([
            { $match: { userId } },
            { $unwind: "$items" },
            { $count: "count" }
        ]);
        const cartCount = await Cart.aggregate([
            { $match: { userId } },
            { $unwind: "$items" },
            { $count: "count" }
        ]);

        return res.json({
            success: true,
            action,
            wishlistCount: wishlistCount[0]?.count || 0,
            cartCount: cartCount[0]?.count || 0
        });


    } catch (err) {
        console.error("Wishlist Toggle Error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};


///////////////////////////////////////////////////////////////////////////////////////////////


const getWishlistPage = async (req, res) => {
    try {

        let user = null;
        if (req.user) {
          user = req.user;
        } else if (req.session.user) {
          user = await User.findById(req.session.user);
        }
    
        res.locals.user = user;
        
        const userId = req.user ? req.user._id : req.session.user;
        if (!userId) return res.redirect("/login");

        const wishlist = await Wishlist.findOne({ userId })
            .populate("items.productId")
            .populate("items.variantId")
            .lean();


        const products = (wishlist?.items || [])
            .filter(item => item.productId) // skip null products
            .map(item => ({
                ...item.productId,
                variantId: item.variantId
            }));

          
        let cartCount = 0;
        try {
            cartCount = await getCartCount(userId);
        } catch { }

        res.render("wishlist", {
            wishlistProducts: products,
            user: req.user,
            cartCount,
            wishlistCount: products.length
        });

    } catch (err) {
        console.error("Wishlist page error:", err);
        res.redirect("/");
    }
};

//////////////////////////////////////////////////////////////////////////////////////////////

const removeFromWishlist = async (req, res) => {
    try {
        const userId = req.user ? req.user._id : req.session.user;
        const { productId, variantId } = req.params;



        const variantIdToUse = typeof variantId === 'object' && variantId._id
            ? variantId._id
            : variantId;

        await Wishlist.updateOne(
            { userId, "items.productId": productId, "items.variantId": variantIdToUse },
            { $pull: { items: { productId, variantId: variantIdToUse } } }
        );

        res.json({ success: true, message: 'Removed from wishlist' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error removing from wishlist' });
    }
};



module.exports = {

    addToWishlist,
    getWishlistPage,
    removeFromWishlist
}