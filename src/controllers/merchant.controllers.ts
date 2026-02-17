import { Request, Response } from "express";
import { createMerchant, getMerchant, listMerchants } from "../services/merchant.services.js";

export const createMerchantController = async (req: Request, res: Response) => {
    try {
        const merchant = await createMerchant(req.body);
        res.status(201).json(merchant);
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
};

export const getMerchantController = async (req: Request, res: Response) => {
    try {
        const merchant = await getMerchant(Number(req.params.id));
        res.status(200).json(merchant);
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
};

export const listMerchantsController = async (req: Request, res: Response) => {
    try {
        const merchants = await listMerchants(Number(req.query.limit), Number(req.query.offset));
        res.status(200).json(merchants);
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
};