const Order = require("../../models/orderSchema");
const moment = require("moment");
const excelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const HTTP_STATUS = require("../../constants/httpStatus");


const ORDERS_PER_PAGE = 10;

// Utility: calculate summary data
function calculateProductReport(rows) {
  let totalSales = rows.length;
  let totalAmount = 0;
  let totalDiscount = 0;

  rows.forEach(row => {
    totalAmount += row.totalPrice || 0;
    totalDiscount += row.discount || 0;
  });

  return { totalSales, totalAmount, totalDiscount };
}

// ---------------------- Sales Report (Delivered Products Only) ----------------------

const getSalesReportPage = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * ORDERS_PER_PAGE;

    const today = moment().startOf("day");
    const tomorrow = moment(today).endOf("day");

    const matchQuery = {
      paymentStatus: "Paid",
      "orderedItems.status": "Delivered",
      createdAt: { $gte: today, $lte: tomorrow }
    };

    const ordersData = await Order.find(matchQuery)
      .populate("user", "name email")
      .populate("orderedItems.product", "name")
      .sort({ createdAt: -1 })
      .lean();

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

    const totalOrders = rows.length;
    const paginatedRows = rows.slice(skip, skip + ORDERS_PER_PAGE);
    const totalPages = Math.ceil(totalOrders / ORDERS_PER_PAGE);
    const reportData = calculateProductReport(rows);

    res.status(HTTP_STATUS.OK).render("sales-report", {
      orders: paginatedRows,
      moment,
      reportData,
      filters: { range: "Today" },
      page,
      totalPages,
      skip
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------- Filter Sales Report ----------------------

const filterSalesReport = async (req, res, next) => {
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
      // ✅ Date validation
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(HTTP_STATUS.BAD_REQUEST).render("sales-report", {
          orders: [],
          moment,
          reportData: { totalSales: 0, totalAmount: 0, totalDiscount: 0 },
          filters: { type, startDate, endDate },
          page,
          totalPages: 0,
          skip,
          errorMessage: "Invalid date format. Please select valid dates.",
        });
      }

      if (start > end) {
        // ⚠️ To Date must be greater than From Date
        return res.status(HTTP_STATUS.BAD_REQUEST).render("sales-report", {
          orders: [],
          moment,
          reportData: { totalSales: 0, totalAmount: 0, totalDiscount: 0 },
          filters: { type, startDate, endDate },
          page,
          totalPages: 0,
          skip,
          errorMessage: "To Date must be greater than From Date.",
        });
      }

      matchQuery.createdAt = { $gte: start, $lte: end };
    }
 
    // Continue normally if valid
    const ordersData = await Order.find(matchQuery)
      .populate("user", "name email")
      .populate("orderedItems.product", "name")
      .sort({ createdAt: -1 })
      .lean();

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

    const totalOrders = rows.length;
    const paginatedRows = rows.slice(skip, skip + ORDERS_PER_PAGE);
    const totalPages = Math.ceil(totalOrders / ORDERS_PER_PAGE);
    const reportData = calculateProductReport(rows);

    res.status(HTTP_STATUS.OK).render("sales-report", {
      orders: paginatedRows,
      moment,
      reportData,
      filters: { type, startDate, endDate },
      page,
      totalPages,
      skip,
      errorMessage: null, // ✅ for frontend handling
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------- Download Sales Report (Excel / PDF) ----------------------

const downloadSalesReport = async (req, res, next) => {
  try {
    const { type } = req.params;
    const { type: filterType, startDate, endDate } = req.query;

    let matchQuery = { paymentStatus: "Paid", "orderedItems.status": "Delivered" };

    if (filterType === "daily") {
      matchQuery.createdAt = { $gte: moment().startOf("day").toDate(), $lte: moment().endOf("day").toDate() };
    } else if (filterType === "weekly") {
      matchQuery.createdAt = { $gte: moment().startOf("week").toDate(), $lte: moment().endOf("week").toDate() };
    } else if (filterType === "monthly") {
      matchQuery.createdAt = { $gte: moment().startOf("month").toDate(), $lte: moment().endOf("month").toDate() };
    } else if (filterType === "custom" && startDate && endDate) {
      matchQuery.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    const ordersData = await Order.find(matchQuery)
      .populate("user", "name email")
      .populate("orderedItems.product", "name")
      .sort({ createdAt: -1 })
      .lean();

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
        worksheet.addRow({ sl: index + 1, ...row });
      });

      res
        .status(HTTP_STATUS.OK)
        .setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        .setHeader("Content-Disposition", "attachment; filename=sales-report.xlsx");

      return workbook.xlsx.write(res).then(() => res.end());
    }

    if (type === "pdf") {
      const doc = new PDFDocument({ size: "A4", margin: 30 });
      res
        .status(HTTP_STATUS.OK)
        .setHeader("Content-Type", "application/pdf")
        .setHeader("Content-Disposition", "attachment; filename=sales-report.pdf");

      doc.pipe(res);
      doc.registerFont("Roboto", "public/fonts/Roboto-VariableFont_wdth,wght.ttf");
      doc.font("Roboto");

      // Title
      doc.fontSize(22).fillColor("#1F4E79").text("Kidooza Boys Fashion", { align: "center" });
      doc.moveDown(1.2);

      doc.fontSize(20).fillColor("#1F4E79").text("Sales Report", { align: "left" });
      doc.moveDown(1);

      const totalOrders = rows.length;
      const totalAmount = rows.reduce((sum, r) => sum + r.totalPrice, 0);
      const totalDiscount = rows.reduce((sum, r) => sum + r.discount, 0);

      const summaryX = doc.options.margin;
      const summaryY = doc.y;
      const cardWidth = 160;
      const cardHeight = 50;
      const cardGap = 20;

      const summaries = [
        { title: "Total Orders", value: totalOrders, color: "grey" },
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
      // Table
      const adjustedHeaders = ["Sl.No", "Order ID", "Date", "Customer", "Quantity", "Total Price", "Discount", "Payment"];
      const adjustedColWidths = [40, 80, 80, 100, 50, 60, 60, 60];
      const rowHeight = 55;

      const tableTop = doc.y;
      let x = doc.options.margin;

      doc.fillColor("#1F4E79").font("Helvetica-Bold").fontSize(10);
      adjustedHeaders.forEach((header, i) => {
        doc.rect(x, tableTop, adjustedColWidths[i], rowHeight).fill("#1F4E79").stroke();
        doc.fillColor("#fff").text(header, x + 3, tableTop + 10, {
          width: adjustedColWidths[i] - 6,
          align: "left"
        });
        x += adjustedColWidths[i];
      });

      let y = tableTop + rowHeight;
      rows.forEach((row, index) => {
        x = doc.options.margin;
        if (index % 2 === 0)
          doc.rect(x, y, adjustedColWidths.reduce((a, b) => a + b, 0), rowHeight).fill("#f2f2f2").stroke();

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
        if (y > doc.page.height - 50) {
          doc.addPage();
          y = doc.options.margin;
        }
      });

      doc.end();
    }
  } catch (error) {
    next(error);
  }
};
 



module.exports = {
  getSalesReportPage,
  filterSalesReport,
  downloadSalesReport
};
