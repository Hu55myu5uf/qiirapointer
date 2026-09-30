import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';

const router = Router();

export interface CartItem {
    id: string; // post ID or product ID
    title: string;
    caption?: string;
    mediaUrl: string;
    price: number;
    currency: string;
    vendorId: string;
    vendorName: string;
    quantity: number;
    addedAt: string;
}

/**
 * @route   GET /api/cart/:userId
 * @desc    Get user's shopping cart
 * @access  Authenticated user
 */
router.get('/:userId', async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        const cartDoc = await db.collection('carts').doc(userId).get();

        if (!cartDoc.exists) {
            return res.status(200).json({
                items: [],
                totalItems: 0,
                subtotal: 0,
                currency: 'NGN',
            });
        }

        const data = cartDoc.data()!;
        const items: CartItem[] = data.items || [];
        const totalItems = items.reduce((acc, it) => acc + (it.quantity || 1), 0);
        const subtotal = items.reduce((acc, it) => acc + (it.price || 0) * (it.quantity || 1), 0);

        res.status(200).json({
            items,
            totalItems,
            subtotal,
            currency: items[0]?.currency || 'NGN',
            updatedAt: data.updatedAt,
        });
    } catch (error: any) {
        console.error('Get cart error:', error);
        res.status(500).json({ error: 'Failed to fetch cart', message: error.message });
    }
});

/**
 * @route   POST /api/cart/:userId/add
 * @desc    Add item to cart
 * @access  Authenticated user
 */
router.post('/:userId/add', async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        const {
            id,
            title,
            caption,
            mediaUrl,
            price = 0,
            currency = 'NGN',
            vendorId,
            vendorName = 'Vendor',
            quantity = 1,
        } = req.body;

        if (!id || !vendorId) {
            return res.status(400).json({ error: 'Product id and vendorId are required' });
        }

        const cartRef = db.collection('carts').doc(userId);
        const cartDoc = await cartRef.get();

        let items: CartItem[] = [];
        if (cartDoc.exists) {
            items = cartDoc.data()!.items || [];
        }

        const existingIndex = items.findIndex((it) => it.id === id);
        if (existingIndex > -1) {
            items[existingIndex].quantity += Number(quantity) || 1;
        } else {
            items.push({
                id,
                title: title || caption?.substring(0, 40) || 'Product',
                caption: caption || '',
                mediaUrl: mediaUrl || '',
                price: Number(price) || 0,
                currency,
                vendorId,
                vendorName,
                quantity: Number(quantity) || 1,
                addedAt: new Date().toISOString(),
            });
        }

        const totalItems = items.reduce((acc, it) => acc + (it.quantity || 1), 0);
        const subtotal = items.reduce((acc, it) => acc + (it.price || 0) * (it.quantity || 1), 0);

        await cartRef.set({
            userId,
            items,
            totalItems,
            subtotal,
            updatedAt: new Date().toISOString(),
        }, { merge: true });

        res.status(200).json({
            message: 'Item added to cart',
            items,
            totalItems,
            subtotal,
            currency,
        });
    } catch (error: any) {
        console.error('Add to cart error:', error);
        res.status(500).json({ error: 'Failed to add item to cart', message: error.message });
    }
});

/**
 * @route   PUT /api/cart/:userId/item/:itemId
 * @desc    Update item quantity in cart
 * @access  Authenticated user
 */
router.put('/:userId/item/:itemId', async (req: Request, res: Response) => {
    try {
        const { userId, itemId } = req.params;
        const { quantity } = req.body;

        const cartRef = db.collection('carts').doc(userId);
        const cartDoc = await cartRef.get();

        if (!cartDoc.exists) {
            return res.status(404).json({ error: 'Cart not found' });
        }

        let items: CartItem[] = cartDoc.data()!.items || [];
        const index = items.findIndex((it) => it.id === itemId);

        if (index === -1) {
            return res.status(404).json({ error: 'Item not found in cart' });
        }

        const qty = Number(quantity);
        if (qty <= 0) {
            items.splice(index, 1);
        } else {
            items[index].quantity = qty;
        }

        const totalItems = items.reduce((acc, it) => acc + (it.quantity || 1), 0);
        const subtotal = items.reduce((acc, it) => acc + (it.price || 0) * (it.quantity || 1), 0);

        await cartRef.set({
            items,
            totalItems,
            subtotal,
            updatedAt: new Date().toISOString(),
        }, { merge: true });

        res.status(200).json({
            message: 'Cart updated',
            items,
            totalItems,
            subtotal,
        });
    } catch (error: any) {
        console.error('Update cart item error:', error);
        res.status(500).json({ error: 'Failed to update item quantity', message: error.message });
    }
});

/**
 * @route   DELETE /api/cart/:userId/item/:itemId
 * @desc    Remove item from cart
 * @access  Authenticated user
 */
router.delete('/:userId/item/:itemId', async (req: Request, res: Response) => {
    try {
        const { userId, itemId } = req.params;
        const cartRef = db.collection('carts').doc(userId);
        const cartDoc = await cartRef.get();

        if (!cartDoc.exists) {
            return res.status(200).json({ items: [], totalItems: 0, subtotal: 0 });
        }

        let items: CartItem[] = cartDoc.data()!.items || [];
        items = items.filter((it) => it.id !== itemId);

        const totalItems = items.reduce((acc, it) => acc + (it.quantity || 1), 0);
        const subtotal = items.reduce((acc, it) => acc + (it.price || 0) * (it.quantity || 1), 0);

        await cartRef.set({
            items,
            totalItems,
            subtotal,
            updatedAt: new Date().toISOString(),
        }, { merge: true });

        res.status(200).json({
            message: 'Item removed from cart',
            items,
            totalItems,
            subtotal,
        });
    } catch (error: any) {
        console.error('Remove cart item error:', error);
        res.status(500).json({ error: 'Failed to remove item', message: error.message });
    }
});

/**
 * @route   DELETE /api/cart/:userId/clear
 * @desc    Clear all items in cart
 * @access  Authenticated user
 */
router.delete('/:userId/clear', async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        await db.collection('carts').doc(userId).set({
            items: [],
            totalItems: 0,
            subtotal: 0,
            updatedAt: new Date().toISOString(),
        }, { merge: true });

        res.status(200).json({
            message: 'Cart cleared',
            items: [],
            totalItems: 0,
            subtotal: 0,
        });
    } catch (error: any) {
        console.error('Clear cart error:', error);
        res.status(500).json({ error: 'Failed to clear cart', message: error.message });
    }
});

export default router;
