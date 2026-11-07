const Table = require("../models/tableModel");
const createHttpError = require("http-errors");
const mongoose = require("mongoose")
const { notify } = require("../services/events");

const addTable = async (req, res, next) => {
  try {
    const tableNo = Math.floor(Number(req.body.tableNo));
    const seats = Math.floor(Number(req.body.seats));
    if (!(tableNo >= 1 && tableNo <= 9999) || !(seats >= 1 && seats <= 100)) {
      const error = createHttpError(400, "Enter a table number and seats.");
      return next(error);
    }
    const isTablePresent = await Table.findOne({ tableNo });

    if (isTablePresent) {
      const error = createHttpError(400, "That table number already exists.");
      return next(error);
    }

    const newTable = new Table({ tableNo, seats });
    await newTable.save();
    notify(req, "tables");
    res
      .status(201)
      .json({ success: true, message: "Table added", data: newTable });
  } catch (error) {
    next(error);
  }
};

const getTables = async (req, res, next) => {
  try {
    const tables = await Table.find().sort({ tableNo: 1 }).populate({
      path: "currentOrder",
      select: "orderNo customer guests bills.total kitchenStatus createdAt"
    });
    res.status(200).json({ success: true, data: tables });
  } catch (error) {
    next(error);
  }
};

// Only the number and seats are editable here; status is managed by orders
const updateTable = async (req, res, next) => {
  try {
    const { tableNo, seats } = req.body;
    const { id } = req.params;

    if(!mongoose.Types.ObjectId.isValid(id)){
        const error = createHttpError(404, "Table not found.");
        return next(error);
    }

    const update = {};
    if (tableNo !== undefined) update.tableNo = Math.floor(Number(tableNo));
    if (seats !== undefined) update.seats = Math.floor(Number(seats));
    if ((update.tableNo !== undefined && !(update.tableNo >= 1 && update.tableNo <= 9999)) || (update.seats !== undefined && !(update.seats >= 1 && update.seats <= 100))) {
      return next(createHttpError(400, "Enter a valid table number and seats."));
    }

    const table = await Table.findByIdAndUpdate(id, update, { new: true, runValidators: true });

    if (!table) {
      const error = createHttpError(404, "Table not found.");
      return next(error);
    }

    notify(req, "tables");
    res.status(200).json({success: true, message: "Table updated", data: table});

  } catch (error) {
    if (error.code === 11000) return next(createHttpError(409, "That table number already exists."));
    next(error);
  }
};

const deleteTable = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return next(createHttpError(404, "Table not found."));
    const table = await Table.findOneAndDelete({ _id: req.params.id, status: "Available" });
    if (!table) return next(createHttpError(409, "Only free tables can be deleted."));
    notify(req, "tables");
    res.status(200).json({ success: true, message: "Table deleted" });
  } catch (error) {
    next(error);
  }
};

module.exports = { addTable, getTables, updateTable, deleteTable };
