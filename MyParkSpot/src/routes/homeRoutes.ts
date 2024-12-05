import express from "express";

import homeController from "../controllers/homeController";

const router = express.Router();

router.get("/", homeController.getHome);
router.get("/map", homeController.getMap);
router.get("/mysql-data", homeController.getMysqlData);
router.get("/redis-data", homeController.getRedisData);

export default router;
