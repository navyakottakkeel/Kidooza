const mongoose = require("mongoose");
const {Schema} = mongoose;


const userSchema = new Schema({
    name : {
        type : String,
        required : true
    },
    email : {
        type : String,
        required : true,
        unique : true
    },
    phone : {
        type : String,
        default : null
    },
    googleId : {
        type : String,
        unique : true,
        sparse : true
    },
    password : {
        type : String,
        required : false
    },
    isBlocked : {
        type : Boolean,
        default : false
    },
    isAdmin : {
        type : Boolean,
        default : false
    },
    profilePhoto : {
        type : String,
        default : 'profile.webp'
    },
    cart : [{
        type : Schema.Types.ObjectId,
        ref : "Cart"
    }],
    orderHistory : [{
        type : Schema.Types.ObjectId,
        ref : "Order"
    }],
    createdAt : {
        type : Date,
        default : Date.now
    },
    referalcode : {
        type : String
    },
    redeemed : {
        type : Boolean,
        default: false
    },
    redeemedUsers : [{
        type : mongoose.Schema.Types.ObjectId,
        ref : "User"
    }],
    searchHistory : {
        category : {
            type : Schema.Types.ObjectId,
            ref : "Category"
        },
        brand : {
            type : String
        },
        searchOn  :{ 
            type : Date,
            default : Date.now
        }
    }
})



const User = mongoose.model("User",userSchema);
module.exports = User;