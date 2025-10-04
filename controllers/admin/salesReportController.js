const Order = require("../../models/orderSchema");
const moment = require("moment");
const excelJS = require("exceljs");
const PDFDocument = require("pdfkit");


const ORDERS_PER_PAGE = 10;


// ---------------------- Sales Report (Delivered Products Only) ----------------------
const getSalesReportPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * ORDERS_PER_PAGE;

    const today = moment().startOf("day");
    const tomorrow = moment(today).endOf("day");

    // ✅ Only delivered items
    const matchQuery = {
      paymentStatus: "Paid",
      "orderedItems.status": "Delivered",
      createdAt: { $gte: today, $lte: tomorrow }
    };

    // fetch all matching orders
    const ordersData = await Order.find(matchQuery)
      .populate("user", "name email")
      .populate("orderedItems.product", "name")
      .sort({ createdAt: -1 })
      .lean();

    // flatten product-based rows
    const rows = [];
    ordersData.forEach(order => {
      order.orderedItems.forEach(item => {
        if (item.status === "Delivered") {
          // proportional coupon discount (optional)
          let couponShare = 0;
          if (order.couponDiscount && order.finalAmount) {
            const itemTotal = item.salePrice * item.quantity;
            couponShare = (itemTotal / order.totalPrice) * order.couponDiscount;
          }

          rows.push({
            orderId: order.orderId,
            date: order.createdAt,
            customer: order.user?.name || "Guest",
            product: item.product?.name || item.productName || "Unknown Product",
            quantity: item.quantity,
            price: item.salePrice,
            totalPrice: item.salePrice * item.quantity,
            discount: (item.basePrice - item.salePrice) * item.quantity + couponShare,
            payment: order.paymentMethod
          });
        }
      });
    });

    // pagination
    const totalOrders = rows.length;
    const paginatedRows = rows.slice(skip, skip + ORDERS_PER_PAGE);
    const totalPages = Math.ceil(totalOrders / ORDERS_PER_PAGE);

    const reportData = calculateProductReport(rows);

    res.render("sales-report", {
      orders: paginatedRows,
      moment,
      reportData, // you can still compute summary if needed
      filters: { range: "Today" },
      page,
      totalPages,
      skip
    });
  } catch (err) {
    console.error("Error loading sales report:", err);
    res.status(500).send("Server Error");
  }
};

// ---------------------- Filter Sales Report ----------------------
const filterSalesReport = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * ORDERS_PER_PAGE;
    const { type, startDate, endDate } = req.query;

    let matchQuery = { paymentStatus: "Paid", "orderedItems.status": "Delivered" };

    if (type === "daily") {
      matchQuery.createdAt = {
        $gte: moment().startOf("day").toDate(),
        $lte: moment().endOf("day").toDate()
      };
    } else if (type === "weekly") {
      matchQuery.createdAt = {
        $gte: moment().startOf("week").toDate(),
        $lte: moment().endOf("week").toDate()
      };
    } else if (type === "monthly") {
      matchQuery.createdAt = {
        $gte: moment().startOf("month").toDate(),
        $lte: moment().endOf("month").toDate()
      };
    } else if (type === "custom" && startDate && endDate) {
      matchQuery.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // fetch matching orders
    const ordersData = await Order.find(matchQuery)
      .populate("user", "name email")
      .populate("orderedItems.product", "name")
      .sort({ createdAt: -1 })
      .lean();

    // flatten product-based rows
    const rows = [];
    ordersData.forEach(order => {
      order.orderedItems.forEach(item => {
        if (item.status === "Delivered") {
          let couponShare = 0;
          if (order.couponDiscount && order.finalAmount) {
            const itemTotal = item.salePrice * item.quantity;
            couponShare = (itemTotal / order.totalPrice) * order.couponDiscount;
          }

          rows.push({
            orderId: order.orderId,
            date: order.createdAt,
            customer: order.user?.name || "Guest",
            product: item.product?.name || item.productName || "Unknown Product",
            quantity: item.quantity,
            price: item.salePrice,
            totalPrice: item.salePrice * item.quantity,
            discount: (item.basePrice - item.salePrice) * item.quantity + couponShare,
            payment: order.paymentMethod
          });
        }
      });
    });

    // pagination
    const totalOrders = rows.length;
    const paginatedRows = rows.slice(skip, skip + ORDERS_PER_PAGE);
    const totalPages = Math.ceil(totalOrders / ORDERS_PER_PAGE);

    const reportData = calculateProductReport(rows);

    res.render("sales-report", {
      orders: paginatedRows,
      moment,
      reportData,
      filters: { type, startDate, endDate },
      page,
      totalPages,
      skip
    });
  } catch (err) {
    console.error("Error filtering sales report:", err);
    res.status(500).send("Server Error");
  }
};



function calculateProductReport(rows) {
  let totalSales = rows.length; // number of delivered product rows
  let totalAmount = 0;
  let totalDiscount = 0;

  rows.forEach(row => {
    totalAmount += row.totalPrice || 0;
    totalDiscount += row.discount || 0;
  });

  return { totalSales, totalAmount, totalDiscount };
}


// ✅ Helper: Calculate Report Totals
function calculateReport(orders) {
  let totalSales = orders.length;
  let totalAmount = 0;
  let totalDiscount = 0;

  orders.forEach(order => {
    totalAmount += order.finalAmount || 0;
    totalDiscount += order.discount || 0;
  });

  return { totalSales, totalAmount, totalDiscount };
}

/////////////////////////////////////////////////////////////////////////////////////////////////////

// ✅ Download Report
const downloadSalesReport = async (req, res) => {
  try {
    const { type } = req.params; // pdf or excel
    const { type: filterType, startDate, endDate } = req.query;

    let matchQuery = { paymentStatus: "Paid", "orderedItems.status": "Delivered" };

    if (filterType === "daily") {
      matchQuery.createdAt = {
        $gte: moment().startOf("day").toDate(),
        $lte: moment().endOf("day").toDate()
      };
    } else if (filterType === "weekly") {
      matchQuery.createdAt = {
        $gte: moment().startOf("week").toDate(),
        $lte: moment().endOf("week").toDate()
      };
    } else if (filterType === "monthly") {
      matchQuery.createdAt = {
        $gte: moment().startOf("month").toDate(),
        $lte: moment().endOf("month").toDate()
      };
    } else if (filterType === "custom" && startDate && endDate) {
      matchQuery.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Fetch all filtered orders
    const ordersData = await Order.find(matchQuery)
      .populate("user", "name email")
      .populate("orderedItems.product", "name")
      .sort({ createdAt: -1 })
      .lean();

    // Flatten orders into product-level rows
    const rows = [];
    ordersData.forEach(order => {
      order.orderedItems.forEach(item => {
        if (item.status === "Delivered") {
          let couponShare = 0;
          if (order.couponDiscount && order.totalPrice) {
            const itemTotal = item.salePrice * item.quantity;
            couponShare = (itemTotal / order.totalPrice) * order.couponDiscount;
          }

          rows.push({
            orderId: order.orderId,
            date: order.createdAt,
            customer: order.user?.name || "Guest",
            product: item.product?.name || item.productName || "Unknown Product",
            quantity: item.quantity,
            price: item.salePrice,
            totalPrice: item.salePrice * item.quantity,
            discount: (item.basePrice - item.salePrice) * item.quantity + couponShare,
            payment: order.paymentMethod
          });
        }
      });
    });

    if (type === "excel") {
      const workbook = new excelJS.Workbook();
      const worksheet = workbook.addWorksheet("Sales Report");

      worksheet.columns = [
        { header: "Sl.No", key: "sl", width: 10 },
        { header: "Order ID", key: "orderId", width: 25 },
        { header: "Date", key: "date", width: 20 },
        { header: "Customer", key: "customer", width: 25 },
        { header: "Product", key: "product", width: 25 },
        { header: "Quantity", key: "quantity", width: 10 },
        { header: "Price", key: "price", width: 15 },
        { header: "Total Price", key: "totalPrice", width: 15 },
        { header: "Discount", key: "discount", width: 15 },
        { header: "Payment", key: "payment", width: 15 }
      ];

      rows.forEach((row, index) => {
        worksheet.addRow({
          sl: index + 1,
          ...row
        });
      });

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=sales-report.xlsx"
      );

      return workbook.xlsx.write(res).then(() => res.end());
    }

    if (type === "pdf") {
      const doc = new PDFDocument({ size: "A4", layout: "portrait", margin: 30 });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=sales-report.pdf"
      );
      doc.pipe(res);

      doc.registerFont("Roboto", "public/fonts/Roboto-VariableFont_wdth,wght.ttf");
      doc.font("Roboto"); // set it as default

      // --- Title ---
      doc.fontSize(22).fillColor("#1F4E79").text("Kidooza Boys Fashion", { align: "center" });
      doc.moveDown(1.2);

      doc.fontSize(20).fillColor("#1F4E79").text("Sales Report", { align: "left" });
      doc.moveDown(1);

      // --- Summary Cards ---
      const totalOrders = rows.length;
      const totalAmount = rows.reduce((sum, r) => sum + r.totalPrice, 0);
      const totalDiscount = rows.reduce((sum, r) => sum + r.discount, 0);

      const summaryX = doc.options.margin;
      const summaryY = doc.y;

      const cardWidth = 160;
      const cardHeight = 50;
      const cardGap = 20;

      const summaries = [
        { title: "Total Orders", value: totalOrders, color: 'grey' },
        { title: "Total Amount", value: `₹${totalAmount.toFixed(2)}`, color: "grey" },
        { title: "Total Discount", value: `₹${totalDiscount.toFixed(2)}`, color: "grey" }
      ];

      summaries.forEach((card, i) => {
        const x = summaryX + i * (cardWidth + cardGap);
        doc.rect(x, summaryY, cardWidth, cardHeight).fill(card.color).stroke();
        doc.fillColor("#fff").fontSize(12).text(card.title, x + 10, summaryY + 10);
        doc.fontSize(16).text(card.value, x + 10, summaryY + 25);
      });

      doc.moveDown(2);

      // --- Table ---
      doc.font("Roboto").fontSize(10).fillColor("#fff");
      const tableTop = doc.y;
      const rowHeight = 55; // Increased height
      const colWidths = [40, 80, 80, 80, 50, 50, 50]; // Only the remaining columns
      const headers = ["Sl.No", "Order ID", "Date", "Customer", "Qty", "Total", "Discount", "Payment"];

      // Adjust headers and columns (excluding product & price)
      const adjustedHeaders = ["Sl.No", "Order ID", "Date", "Customer", "Quantity", "Total Price", "Discount", "Payment"];
      const adjustedColWidths = [40, 80, 80, 100, 50, 60, 60, 60];

      // Draw header
      doc.fillColor("#1F4E79").fontSize(10).font("Helvetica-Bold");
      let x = doc.options.margin;
      adjustedHeaders.forEach((header, i) => {
        doc.rect(x, tableTop, adjustedColWidths[i], rowHeight).fill("#1F4E79").stroke();
        doc.fillColor("#fff").text(header, x + 3, tableTop + 10, { width: adjustedColWidths[i] - 6, align: "left" });
        doc.fillColor("#fff");              
        doc.font("Roboto");
        x += adjustedColWidths[i];
      });

      // Draw rows 
      let y = tableTop + rowHeight;
      rows.forEach((row, index) => {
        x = doc.options.margin;

        // alternating row colors
        if (index % 2 === 0) {
          doc.rect(x, y, adjustedColWidths.reduce((a, b) => a + b, 0), rowHeight).fill("#f2f2f2").stroke();
        }

        doc.fillColor("#000").font("Helvetica").fontSize(10);
        const values = [
          index + 1,
          row.orderId,
          moment(row.date).format("YYYY-MM-DD"),
          row.customer,
          row.quantity,
          `₹${row.totalPrice}`,
          `₹${row.discount.toFixed(2)}`,
          row.payment
        ];

        values.forEach((val, i) => {
          doc.text(val, x + 3, y + 15, { width: adjustedColWidths[i] - 6, align: "left" });
          x += adjustedColWidths[i];
        });

        y += rowHeight;

        // Add new page if needed
        if (y > doc.page.height - 50) {
          doc.addPage();
          y = doc.options.margin;
        }
      });

      doc.end();
    }

  } catch (err) {
    console.error("Error downloading sales report:", err);
    res.status(500).send("Server Error");
  }
};




module.exports = {
  getSalesReportPage,
  filterSalesReport,
  downloadSalesReport
};
