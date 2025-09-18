const Product = require('../../models/productSchema');
const User = require('../../models/userSchema');
const Variant = require('../../models/variantSchema');
const Wishlist = require('../../models/wishlistSchema');




const addToWishlist = async (req, res) => {
    try {
        const { productId, colour } = req.body;
        console.log("colour : ", colour);

        const userId = req.user ? req.user._id : req.session.user;
        console.log("userid : ", userId);

        if (!productId || !colour) {
            return res.status(400).json({ success: false, message: "Missing product or variant ID" });
        }

        let wishlist = await Wishlist.findOne({ userId });

        // If no wishlist yet, create one with this item
        if (!wishlist) {
            console.log("no wishlisted");
            wishlist = new Wishlist({
                userId,
                items: [{ productId, colour }]
            });
            await wishlist.save();
            return res.json({ success: true, action: "added" });
        }

        // Check if item already exists
        const itemIndex = wishlist.items.findIndex(item =>
            item.productId.toString() === productId && item.colour === colour
        );



        if (itemIndex > -1) {
            // Exists → remove it
            wishlist.items.splice(itemIndex, 1);
            await wishlist.save();
            return res.json({ success: true, action: "removed", wishlistCount: wishlist.items.length });
        } else {
            // Not exists → add it
            wishlist.items.push({ productId, colour  });
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
      const userId = req.user ? req.user._id : req.session.user;
      if (!userId) return res.redirect("/login");
  
      let user = null;
      if (req.user) {
        user = req.user;
      } else if (req.session.user) {
        user = await User.findById(req.session.user);
      }
      res.locals.user = user;
  
      const wishlist = await Wishlist.findOne({ userId })
        .populate("items.productId")
        .lean();

        const sortedItems = (wishlist?.items || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
      // Group by productId
      const productMap = new Map();
  
      sortedItems.forEach(item => {
        if (!item.productId) return;
        const pid = item.productId._id.toString();
  
        if (!productMap.has(pid)) {
          productMap.set(pid, {
            _id: item.productId._id,
            name: item.productId.productName,
            description : item.productId.description,
            basePrice: item.productId.basePrice,
            salePrice: item.productId.salePrice,
            images: item.productId.images,
            variantsByColour: item.productId.variantsByColour, // from your schema
            wishlistedColours: []
          });
        }
  
        productMap.get(pid).wishlistedColours.push(item.colour);
      });
  
      const products = Array.from(productMap.values());

      /////////////////////////////////

      for (let product of products) {
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

    ////////////////////////////////////
  
      let cartCount = 0;
      try {
        cartCount = await getCartCount(userId);
      } catch {}
  
      res.render("wishlist", {
        wishlistProducts: products,
        user,
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
        const { productId } = req.params;


        await Wishlist.updateOne(
            { userId, "items.productId": productId },
            { $pull: { items: { productId } } }
        );

        res.json({ success: true, action: "removed" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error removing from wishlist' });
    }
};


//////////////////////////////////////////////////////////////////////////////////////////////////////


const toggleWishlist = async (req, res) => {
    try {

        const userId = req.user ? req.user._id : req.session.user;

        if (!userId) {
            return res.json({ success: false, loginRequired: true });
        }

        const { productId, colour } = req.body;
        if (!productId || !colour) {
            return res.json({ success: false, message: "Missing product or colour" });
        }

        let wishlist = await Wishlist.findOne({ userId });

        if (!wishlist) {
            // First time user adds something → create wishlist
            wishlist = new Wishlist({
                userId,
                items: [{ productId, colour }]
            });
            await wishlist.save();
            return res.json({ success: true, action: "added" });
        }

        // Check if already exists
        const exists = wishlist.items.some(
            item => item.productId.toString() === productId &&
                item.colour === colour
        );

        if (exists) {
            // Remove it
            await Wishlist.updateOne(
                { userId },
                { $pull: { items: { productId, colour } } }
            );
            return res.json({ success: true, action: "removed" });
        } else {
            // Add it
            await Wishlist.updateOne(
                { userId },
                { $push: { items: { productId, colour  } } }
            );
            return res.json({ success: true, action: "added" });
        }

    } catch (err) {
        console.error("Wishlist toggle error:", err);
        res.status(500).json({ success: false });
    }
};



///////////////////////////////////////////////////////////////////////////////////////////////

const getVariantsByProduct = async (req, res) => {
    try {
      const { id } = req.params;
      const variants = await Variant.find({ productId: id }).lean();
  
      if (!variants || variants.length === 0) {
        return res.json({ success: false });
      }
  
      const groupedByColour = {};
      variants.forEach(v => {
        if (!groupedByColour[v.colour]) groupedByColour[v.colour] = [];
        groupedByColour[v.colour].push({
          _id: v._id,
          size: v.size,
          stock: v.stock,
          image: v.productImage[0] || ""
        });
      });
  
      res.json({ success: true, groupedByColour });
    } catch (err) {
      console.error(err);
      res.json({ success: false });
    }
  };


module.exports = {

    addToWishlist,
    getWishlistPage,
    removeFromWishlist,
    toggleWishlist,
    getVariantsByProduct
}