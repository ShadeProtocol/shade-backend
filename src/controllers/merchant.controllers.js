import { createMerchant, getMerchant, listMerchants, registerMerchant, getMyProfile, updateMyProfile, generateMerchantSigningKey, } from '../services/merchant.services.js';
import { validateRegisterMerchant, validateUpdateMerchant } from '../utils/validation.js';
import { AppError } from '../utils/errors.js';
export const createMerchantController = async (req, res) => {
    try {
        const merchant = await createMerchant(req.body);
        res.status(201).json(merchant);
    }
    catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
export const getMerchantController = async (req, res) => {
    try {
        const merchant = await getMerchant(Number(req.params.id));
        res.status(200).json(merchant);
    }
    catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
export const listMerchantsController = async (req, res) => {
    try {
        const merchants = await listMerchants(Number(req.query.limit), Number(req.query.offset));
        res.status(200).json(merchants);
    }
    catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
export const registerMerchantController = async (req, res) => {
    const merchant = req.merchant;
    if (!merchant) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const errors = validateRegisterMerchant(req.body);
    if (Object.keys(errors).length > 0) {
        res.status(400).json({ error: 'Validation failed', errors });
        return;
    }
    try {
        const profile = await registerMerchant(merchant.id, req.body);
        res.status(200).json(profile);
    }
    catch (error) {
        if (error instanceof AppError) {
            res.status(error.statusCode).json({ error: error.message });
            return;
        }
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
export const getMyProfileController = async (req, res) => {
    const merchant = req.merchant;
    if (!merchant) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    try {
        const profile = await getMyProfile(merchant.id);
        res.status(200).json(profile);
    }
    catch (error) {
        if (error instanceof AppError) {
            res.status(error.statusCode).json({ error: error.message });
            return;
        }
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
export const generateSigningKeyController = async (req, res) => {
    const merchant = req.merchant;
    if (!merchant) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    try {
        const keys = await generateMerchantSigningKey(merchant.id);
        res.status(201).json(keys);
    }
    catch (error) {
        if (error instanceof AppError) {
            res.status(error.statusCode).json({ error: error.message });
            return;
        }
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
export const updateMyProfileController = async (req, res) => {
    const merchant = req.merchant;
    if (!merchant) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const errors = validateUpdateMerchant(req.body);
    if (Object.keys(errors).length > 0) {
        res.status(400).json({ error: 'Validation failed', errors });
        return;
    }
    try {
        const profile = await updateMyProfile(merchant.id, req.body);
        res.status(200).json(profile);
    }
    catch (error) {
        if (error instanceof AppError) {
            res.status(error.statusCode).json({ error: error.message });
            return;
        }
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
