const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const mongoose = require("mongoose");
const HTTP_STATUS = require('../../constants/httpStatus'); 


// =========================== LOAD ADDRESS PAGE =============================

const loadAddressPage = async (req, res, next) => {
  try {
    let user = null;

    if (req.user) {
      user = req.user;
    } else if (req.session.user) {
      user = await User.findById(req.session.user);
    }

    const userId = req.user ? req.user._id : req.session.user;
    const doc = await Address.findOne({ userId }).lean();
    const addresses = doc ? doc.addresses || [] : [];

    res.locals.user = user;

    res.status(HTTP_STATUS.OK).render("address", {
      addresses,
      user: req.user || null
    });

  } catch (error) {
    next(error);
  }
};
 
// ============================== SAVE ADDRESS ===========================================

const saveAddress = async (req, res, next) => {
  try {
    const userId = req.user ? req.user._id : req.session.user;
    let userAddressDoc = await Address.findOne({ userId });

    const isFirstAddress = !userAddressDoc || userAddressDoc.addresses.length === 0;

    const { name, city, state, pincode, phone, altPhone, addressType, landmark } = req.body;

    if (!name || !city || !state || !pincode || !phone) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "All required fields must be filled."
      });
    }

    if (!/^\d{6}$/.test(pincode)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "Invalid pincode format."
      });
    }

    if (!/^\d{10}$/.test(phone)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "Invalid phone number format."
      });
    }

    if (altPhone && !/^\d{10}$/.test(altPhone)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "Invalid alternate phone format."
      });
    }

    const newAddress = {
      addressType,
      name,
      city,
      landmark,
      state,
      pincode,
      phone,
      altPhone: altPhone || null,
      isDefault: isFirstAddress ? true : (req.body.isDefault || false)
    };

    if (!userAddressDoc) {
      userAddressDoc = new Address({ userId, addresses: [newAddress] });
    } else {
      userAddressDoc.addresses.push(newAddress);
    }

    await userAddressDoc.save();

    return res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: "Address saved successfully"
    });

  } catch (error) {
    next(error);
  }
};

// ============================= SET DEFAULT ADDRESS ====================================

const setDefaultAddress = async (req, res, next) => {
  try {
    const addressId = new mongoose.Types.ObjectId(req.params.id);
    const userId = req.user ? req.user._id : req.session.user;

    await Address.updateOne(
      { userId },
      { $set: { "addresses.$[].isDefault": false } }
    );

    const result = await Address.updateOne(
      { userId, "addresses._id": addressId },
      { $set: { "addresses.$.isDefault": true } }
    );

    if (result.modifiedCount === 0) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: "Address not found"
      });
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Default address updated"
    });

  } catch (error) {
    next(error);
  }
};

// ============================= GET ADDRESS BY ID ========================================

const getAddressById = async (req, res, next) => {
  try {
    const addressId = new mongoose.Types.ObjectId(req.params.id);
    const userId = req.user ? req.user._id : req.session.user;

    const userAddressDoc = await Address.findOne(
      { userId, "addresses._id": addressId },
      { "addresses.$": 1 }
    );

    if (!userAddressDoc || !userAddressDoc.addresses.length) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: "Address not found"
      });
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      address: userAddressDoc.addresses[0]
    });

  } catch (error) {
    next(error);
  }
};

// =========================== UPDATE ADDRESS ===================================

const updateAddress = async (req, res, next) => {
  try {
    const addressId = new mongoose.Types.ObjectId(req.params.id);
    const userId = req.user ? req.user._id : req.session.user;

    const { name, city, state, pincode, phone, altPhone, addressType, landmark } = req.body;

    if (!name || !city || !state || !pincode || !phone) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "All required fields must be filled."
      });
    }

    if (!/^\d{6}$/.test(pincode)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "Invalid pincode format."
      });
    }

    if (!/^\d{10}$/.test(phone)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "Invalid phone number format."
      });
    }

    if (altPhone && !/^\d{10}$/.test(altPhone)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "Invalid alternate phone format."
      });
    }
    
    const updated = await Address.updateOne(
      { userId, "addresses._id": addressId },
      {
        $set: {
            "addresses.$.addressType": addressType,
            "addresses.$.name": name,
            "addresses.$.city": city,
            "addresses.$.landmark": landmark,
            "addresses.$.state": state,
            "addresses.$.pincode": pincode,
            "addresses.$.phone": phone,
            "addresses.$.altPhone": altPhone || null
        }
      }
    );

    if (updated.modifiedCount === 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "Update failed"
      });
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Address updated successfully"
    });

  } catch (error) {
    next(error);
  }
};
 
// ============================= DELETE ADDRESS ======================================

const deleteAddress = async (req, res, next) => {
  try {
    const addressId = new mongoose.Types.ObjectId(req.params.id);
    const userId = req.user ? req.user._id : req.session.user;

    const result = await Address.updateOne(
      { userId },
      { $pull: { addresses: { _id: addressId } } }
    );

    if (result.modifiedCount === 0) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: "Address not found"
      });
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Address deleted successfully"
    });

  } catch (error) {
    next(error);
  }
};

// ==================== EXPORT =====================

module.exports = {
    loadAddressPage,
    saveAddress,
    setDefaultAddress,
    getAddressById,
    updateAddress,
    deleteAddress
}