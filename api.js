import express from 'express';
import { dbOps } from '../db.js';

export function createApiRouter(io) {
  const router = express.Router();

  const requireAdmin = async (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    const pin = req.headers['x-admin-pin'] || (authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '');
    const currentPin = (await dbOps.getSetting('admin_pin')) || 'kaarthi2026';
    if (pin && pin === currentPin) return next();
    return res.status(401).json({ error: 'Unauthorized. Invalid Coach PIN.' });
  };

  // -------------------------------------------------------------
  // PUBLIC ENDPOINTS
  // -------------------------------------------------------------

  router.get('/stats', async (req, res) => {
    try {
      res.json({ success: true, stats: await dbOps.getStats() });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/leads', async (req, res) => {
    try {
      const { name, age, gender, phone, email, instagram, occupation, struggles, goal, plan,
        workout_time, budget, payment_method, experience, message, macro_profile } = req.body;

      if (!name || !phone || !email || !goal) {
        return res.status(400).json({ error: 'Missing required consultation fields (name, phone, email, goal)' });
      }

      const newLead = await dbOps.createLead({
        name, age, gender, phone, email, instagram, occupation,
        struggles: struggles || message || '', goal, plan, workout_time, budget,
        payment_method, experience, message: message || struggles || '', macro_profile
      });

      io.to('admin_room').emit('lead:new', newLead);
      io.emit('stats:updated', await dbOps.getStats());

      res.status(201).json({ success: true, message: 'Consultation request received successfully', lead: newLead });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.get('/leads/track/:refCode', async (req, res) => {
    try {
      const lead = await dbOps.getLeadByRef(req.params.refCode);
      if (!lead) return res.status(404).json({ error: 'Consultation reference not found' });
      res.json({ success: true, ref_code: lead.ref_code, name: lead.name, plan: lead.plan, status: lead.status, created_at: lead.created_at });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.get('/chat/:sessionId', async (req, res) => {
    try {
      res.json({ success: true, history: await dbOps.getChatHistory(req.params.sessionId) });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/chat/:sessionId', async (req, res) => {
    try {
      const { sender, text, sender_name } = req.body;
      if (!text || !sender) return res.status(400).json({ error: 'Sender and text are required' });
      const msg = await dbOps.saveChatMessage(req.params.sessionId, sender, text, sender_name);
      io.to(`chat_${req.params.sessionId}`).emit('chat:message', msg);
      io.to('admin_room').emit('chat:activity', { sessionId: req.params.sessionId, message: msg });
      res.status(201).json({ success: true, message: msg });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // -------------------------------------------------------------
  // CLIENT ACCOUNT (register after free consultation, login, dashboard)
  // -------------------------------------------------------------

  router.post('/client/register', async (req, res) => {
    try {
      const { ref_code, password } = req.body;
      if (!ref_code || !password || password.length < 6) {
        return res.status(400).json({ error: 'Reference code and a password (min 6 chars) are required' });
      }
      const lead = await dbOps.registerClient(ref_code, password);
      res.status(201).json({ success: true, ref_code: lead.ref_code, name: lead.name });
    } catch (err) { res.status(400).json({ error: err.message }); }
  });

  router.post('/client/login', async (req, res) => {
    try {
      const { ref_code, password } = req.body;
      const lead = await dbOps.loginClient(ref_code, password);
      res.json({
        success: true,
        token: `${lead.ref_code}:${password}`,
        client: { id: lead.id, ref_code: lead.ref_code, name: lead.name, plan: lead.plan, status: lead.status, payment_status: lead.payment_status }
      });
    } catch (err) { res.status(401).json({ error: err.message }); }
  });

  const requireClient = async (req, res, next) => {
    try {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      const [ref_code, password] = token.split(':');
      const lead = await dbOps.loginClient(ref_code, password);
      req.client = lead;
      next();
    } catch (err) { res.status(401).json({ error: 'Invalid or expired session' }); }
  };

  router.get('/client/me', requireClient, async (req, res) => {
    const progress = await dbOps.getProgress(req.client.id);
    const payments = await dbOps.getPaymentsForLead(req.client.id);
    const whatsapp = await dbOps.getSetting('whatsapp_number');
    res.json({ success: true, client: req.client, progress, payments, whatsapp_number: whatsapp });
  });

  router.post('/client/payment', requireClient, async (req, res) => {
    try {
      const { amount, method, reference } = req.body;
      const payment = await dbOps.createPayment(req.client.id, amount, method, reference);
      io.to('admin_room').emit('payment:new', { ...payment, client_name: req.client.name, ref_code: req.client.ref_code });
      const whatsapp = await dbOps.getSetting('whatsapp_number');
      const text = encodeURIComponent(`Hi, I'm ${req.client.name} (${req.client.ref_code}). I've made a payment of ₹${amount} via ${method}. Please confirm my slot.`);
      res.status(201).json({ success: true, payment, whatsapp_url: `https://wa.me/${whatsapp}?text=${text}` });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // -------------------------------------------------------------
  // ADMIN AUTH & CONTROL ENDPOINTS
  // -------------------------------------------------------------

  router.post('/admin/login', async (req, res) => {
    const { pin } = req.body;
    const currentPin = (await dbOps.getSetting('admin_pin')) || 'kaarthi2026';
    if (pin === currentPin) return res.json({ success: true, token: pin, coach: 'Kaarthi Lifts Command Center' });
    return res.status(401).json({ success: false, error: 'Invalid PIN' });
  });

  router.get('/admin/leads', requireAdmin, async (req, res) => {
    try { res.json({ success: true, leads: await dbOps.getAllLeads() }); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.patch('/admin/leads/:id', requireAdmin, async (req, res) => {
    try {
      const { status, notes } = req.body;
      const updated = await dbOps.updateLeadStatus(req.params.id, status, notes);
      io.to('admin_room').emit('lead:updated', updated);
      io.emit(`lead_status:${updated.ref_code}`, { ref_code: updated.ref_code, status: updated.status });
      res.json({ success: true, lead: updated });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.delete('/admin/leads/:id', requireAdmin, async (req, res) => {
    try {
      await dbOps.deleteLead(req.params.id);
      io.to('admin_room').emit('lead:deleted', { id: req.params.id });
      res.json({ success: true, message: 'Lead removed' });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.put('/admin/settings', requireAdmin, async (req, res) => {
    try {
      const { batch_name, total_slots, slots_remaining, coach_status, admin_pin, whatsapp_number } = req.body;
      if (batch_name !== undefined) await dbOps.setSetting('batch_name', batch_name);
      if (total_slots !== undefined) await dbOps.setSetting('total_slots', total_slots);
      if (slots_remaining !== undefined) await dbOps.setSetting('slots_remaining', slots_remaining);
      if (coach_status !== undefined) await dbOps.setSetting('coach_status', coach_status);
      if (whatsapp_number !== undefined) await dbOps.setSetting('whatsapp_number', whatsapp_number);
      if (admin_pin !== undefined && admin_pin.length >= 4) await dbOps.setSetting('admin_pin', admin_pin);

      const stats = await dbOps.getStats();
      io.emit('stats:updated', stats);
      io.to('admin_room').emit('settings:updated', await dbOps.getAllSettings());
      res.json({ success: true, stats, settings: await dbOps.getAllSettings() });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.get('/admin/chats', requireAdmin, async (req, res) => {
    try { res.json({ success: true, sessions: await dbOps.getRecentChatSessions() }); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  // --- Admin: client progress management ---
  router.get('/admin/leads/:id/progress', requireAdmin, async (req, res) => {
    try { res.json({ success: true, progress: await dbOps.getProgress(req.params.id) }); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/admin/leads/:id/progress', requireAdmin, async (req, res) => {
    try {
      const entry = await dbOps.addProgress(req.params.id, req.body);
      io.emit(`progress:${req.params.id}`, entry);
      res.status(201).json({ success: true, entry });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.delete('/admin/progress/:entryId', requireAdmin, async (req, res) => {
    try { await dbOps.deleteProgress(req.params.entryId); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  // --- Admin: payments management ---
  router.get('/admin/leads/:id/payments', requireAdmin, async (req, res) => {
    try { res.json({ success: true, payments: await dbOps.getPaymentsForLead(req.params.id) }); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.patch('/admin/payments/:id', requireAdmin, async (req, res) => {
    try {
      const { status } = req.body;
      const payment = await dbOps.updatePaymentStatus(req.params.id, status);
      io.emit(`payment_status:${payment.lead_id}`, payment);
      res.json({ success: true, payment });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  return router;
}
