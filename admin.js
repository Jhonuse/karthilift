/**
 * KAARTHI LIFTS - COACH ADMIN COMMAND CENTER JAVASCRIPT
 */

document.addEventListener('DOMContentLoaded', () => {
    let socket = null;
    let coachPin = sessionStorage.getItem('coach_pin') || '';
    let leads = [];
    let currentFilter = 'all';
    let searchQuery = '';
    let activeChatSessionId = null;
    let chatSessions = [];
    let soundEnabled = true;

    // Elements
    const authModal = document.getElementById('auth-modal');
    const authForm = document.getElementById('auth-form');
    const authPinInput = document.getElementById('auth-pin');
    const authError = document.getElementById('auth-error');
    const adminApp = document.getElementById('admin-app');
    const logoutBtn = document.getElementById('logout-btn');
    const soundToggleBtn = document.getElementById('sound-toggle-btn');
    const soundStatusText = document.getElementById('sound-status-text');
    const leadAudio = document.getElementById('lead-alert-audio');

    // Stats HUD
    const statActiveVisitors = document.getElementById('stat-active-visitors');
    const headerVisitorsCount = document.getElementById('header-visitors-count');
    const statSlotsRemaining = document.getElementById('stat-slots-remaining');
    const statBatchTitle = document.getElementById('stat-batch-title');
    const statNewLeads = document.getElementById('stat-new-leads');
    const statEnrolledLeads = document.getElementById('stat-enrolled-leads');
    const leadsCountBadge = document.getElementById('leads-count-badge');
    const unreadChatsBadge = document.getElementById('unread-chats-badge');

    // Leads UI
    const leadsContainer = document.getElementById('leads-container');
    const leadSearchInput = document.getElementById('lead-search-input');
    const filterPills = document.querySelectorAll('.filter-pill');
    const refreshLeadsBtn = document.getElementById('refresh-leads-btn');
    const btnSlotMinus = document.getElementById('btn-slot-minus');
    const btnSlotPlus = document.getElementById('btn-slot-plus');

    // Chat UI
    const chatThreadsList = document.getElementById('chat-threads-list');
    const chatThreadsCount = document.getElementById('chat-threads-count');
    const chatEmptyState = document.getElementById('chat-empty-state');
    const chatActiveWindow = document.getElementById('chat-active-window');
    const activeChatUser = document.getElementById('active-chat-user');
    const activeChatSessionSpan = document.getElementById('active-chat-session-id');
    const adminChatMessages = document.getElementById('admin-chat-messages');
    const adminChatForm = document.getElementById('admin-chat-form');
    const adminChatInput = document.getElementById('admin-chat-input');
    const adminTypingIndicator = document.getElementById('admin-typing-indicator');

    // Settings UI
    const settingsForm = document.getElementById('settings-form');
    const settingBatchName = document.getElementById('setting-batch-name');
    const settingCoachStatus = document.getElementById('setting-coach-status');
    const settingTotalSlots = document.getElementById('setting-total-slots');
    const settingSlotsRemaining = document.getElementById('setting-slots-remaining');
    const settingAdminPin = document.getElementById('setting-admin-pin');
    const settingsSaveNotification = document.getElementById('settings-save-notification');

    // Tab Navigation
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-tab');
            tabButtons.forEach(b => b.classList.remove('active'));
            tabPanels.forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(target)?.classList.add('active');
        });
    });

    // Sound toggle
    soundToggleBtn.addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        soundStatusText.textContent = soundEnabled ? 'Audio: ON' : 'Audio: OFF';
        soundToggleBtn.style.opacity = soundEnabled ? '1' : '0.6';
    });

    function playAlertSound() {
        if (!soundEnabled || !leadAudio) return;
        leadAudio.currentTime = 0;
        leadAudio.play().catch(() => {});
    }

    // -------------------------------------------------------------
    // AUTHENTICATION & SOCKET INITIALIZATION
    // -------------------------------------------------------------
    function initSocket(pin) {
        socket = io();

        socket.on('connect', () => {
            document.getElementById('connection-status').textContent = 'CONNECTED REAL-TIME';
            socket.emit('join_admin', pin);
        });

        socket.on('disconnect', () => {
            document.getElementById('connection-status').textContent = 'DISCONNECTED (RETRYING...)';
        });

        socket.on('admin:authenticated', (res) => {
            if (res.success) {
                authModal.style.display = 'none';
                adminApp.style.display = 'block';
                sessionStorage.setItem('coach_pin', pin);
                coachPin = pin;
            } else {
                authModal.style.display = 'flex';
                adminApp.style.display = 'none';
                authError.textContent = res.error || 'Authentication failed';
                sessionStorage.removeItem('coach_pin');
            }
        });

        socket.on('admin:initial_data', (data) => {
            leads = data.leads || [];
            updateStatsHUD(data.stats);
            populateSettings(data.settings);
            chatSessions = data.recentChats || [];
            renderLeads();
            renderChatThreads();
        });

        // Real-time visitor count update
        socket.on('presence:count', (data) => {
            statActiveVisitors.textContent = data.count;
            headerVisitorsCount.textContent = data.count;
        });

        // Real-time stats update
        socket.on('stats:updated', (stats) => {
            updateStatsHUD(stats);
        });

        // Real-time new lead submission!
        socket.on('lead:new', (newLead) => {
            leads.unshift(newLead);
            renderLeads();
            playAlertSound();
            showAdminToast(`⚡ New consultation request from ${newLead.name}! (${newLead.plan})`);
        });

        // Real-time lead status change
        socket.on('lead:updated', (updated) => {
            const index = leads.findIndex(l => l.id === updated.id);
            if (index !== -1) {
                leads[index] = updated;
                renderLeads();
            }
        });

        socket.on('lead:deleted', ({ id }) => {
            leads = leads.filter(l => l.id !== id);
            renderLeads();
        });

        // Real-time chat activity from visitors
        socket.on('chat:activity', ({ sessionId, message, senderName }) => {
            const existing = chatSessions.find(s => s.session_id === sessionId);
            if (existing) {
                existing.last_message = message.text;
                existing.last_activity = message.created_at;
                existing.last_sender = message.sender;
            } else {
                chatSessions.unshift({
                    session_id: sessionId,
                    sender_name: senderName || 'Visitor',
                    last_message: message.text,
                    last_activity: message.created_at,
                    last_sender: message.sender,
                    total_messages: 1
                });
            }
            renderChatThreads();
            playAlertSound();

            // If coach is currently looking at this active chat
            if (activeChatSessionId === sessionId) {
                appendChatBubble(message);
            }
        });

        // Incoming message in active chat
        socket.on('chat:message', (msg) => {
            if (activeChatSessionId && activeChatSessionId === socket.activeSession) {
                appendChatBubble(msg);
            }
        });

        socket.on('chat:typing', ({ sender, isTyping }) => {
            if (sender === 'visitor') {
                adminTypingIndicator.style.display = isTyping ? 'block' : 'none';
            }
        });

        socket.on('settings:updated', (settings) => {
            populateSettings(settings);
        });
    }

    // Try auto-login if PIN is saved
    if (coachPin) {
        initSocket(coachPin);
    } else {
        authModal.style.display = 'flex';
    }

    authForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const pin = authPinInput.value.trim();
        if (!pin) return;
        initSocket(pin);
    });

    logoutBtn.addEventListener('click', () => {
        sessionStorage.removeItem('coach_pin');
        window.location.reload();
    });

    // -------------------------------------------------------------
    // STATS & SETTINGS SYNC
    // -------------------------------------------------------------
    function updateStatsHUD(stats) {
        if (!stats) return;
        statSlotsRemaining.textContent = stats.slotsRemaining;
        statBatchTitle.textContent = stats.batchName;
        statNewLeads.textContent = stats.newLeads;
        statEnrolledLeads.textContent = stats.enrolledLeads;
        leadsCountBadge.textContent = stats.totalLeads;
    }

    function populateSettings(settings) {
        if (!settings) return;
        settingBatchName.value = settings.batch_name || '';
        settingCoachStatus.value = settings.coach_status || '';
        settingTotalSlots.value = settings.total_slots || 15;
        settingSlotsRemaining.value = settings.slots_remaining || 3;
    }

    // Quick Slot adjustment
    btnSlotMinus.addEventListener('click', () => {
        socket.emit('slots:adjust', { delta: -1 });
    });
    btnSlotPlus.addEventListener('click', () => {
        socket.emit('slots:adjust', { delta: 1 });
    });

    // -------------------------------------------------------------
    // LEADS MANAGEMENT & RENDERING
    // -------------------------------------------------------------
    leadSearchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase();
        renderLeads();
    });

    filterPills.forEach(pill => {
        pill.addEventListener('click', () => {
            filterPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            currentFilter = pill.getAttribute('data-filter');
            renderLeads();
        });
    });

    refreshLeadsBtn.addEventListener('click', () => {
        fetch('/api/admin/leads', {
            headers: { 'x-admin-pin': coachPin }
        })
        .then(r => r.json())
        .then(d => {
            if (d.leads) {
                leads = d.leads;
                renderLeads();
            }
        });
    });

    function renderLeads() {
        const filtered = leads.filter(lead => {
            const matchesFilter = currentFilter === 'all' || lead.status === currentFilter;
            const searchStr = `${lead.name} ${lead.phone} ${lead.email} ${lead.goal} ${lead.plan} ${lead.ref_code}`.toLowerCase();
            const matchesSearch = !searchQuery || searchStr.includes(searchQuery);
            return matchesFilter && matchesSearch;
        });

        if (filtered.length === 0) {
            leadsContainer.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-secondary);">
                    <p style="font-size: 1.1rem;">No consultations found matching your current filter.</p>
                </div>
            `;
            return;
        }

        leadsContainer.innerHTML = filtered.map(lead => {
            let macroHtml = '';
            if (lead.macro_profile) {
                try {
                    const m = JSON.parse(lead.macro_profile);
                    macroHtml = `
                        <div class="macro-box">
                            <span>🎯 Target: <strong>${m.calories || 2400} kcal</strong></span>
                            <span>🥩 Protein: <strong>${m.protein || 150}g</strong></span>
                            <span>🍚 Carbs: <strong>${m.carbs || 250}g</strong></span>
                        </div>
                    `;
                } catch(e) {}
            }

            const cleanPhone = lead.phone.replace(/[^0-9+]/g, '');
            const waText = encodeURIComponent(`Hi ${lead.name}, this is Coach Kaarthi from Kaarthi Lifts. I reviewed your consultation request for the ${lead.plan}. Let's discuss your targets!`);
            const waUrl = `https://wa.me/${cleanPhone.replace('+', '')}?text=${waText}`;

            const ageGender = (lead.age || lead.gender) ? ` &bull; ${lead.age ? `${lead.age} yrs` : ''} ${lead.gender ? `(${escapeHtml(lead.gender)})` : ''}` : '';
            const igHandle = lead.instagram ? lead.instagram.replace('@', '').trim() : '';
            const igLink = igHandle ? `<a href="https://instagram.com/${igHandle}" target="_blank" rel="noopener" style="color: #e1306c; font-weight:600;">@${igHandle}</a>` : '';

            return `
                <div class="lead-card status-${lead.status}" id="lead-card-${lead.id}">
                    <div class="lead-card-header">
                        <div>
                            <span class="lead-ref">${lead.ref_code} &bull; ${new Date(lead.created_at).toLocaleDateString()} ${new Date(lead.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${ageGender}</span>
                            <h3 class="lead-name">${escapeHtml(lead.name)}</h3>
                        </div>
                        <span class="lead-status-badge badge-${lead.status}">${lead.status}</span>
                    </div>

                    <div class="lead-meta">
                        <div class="meta-row">
                            <span>📞 <a href="tel:${cleanPhone}" style="color: var(--primary-gold);">${escapeHtml(lead.phone)}</a></span>
                            <span>&bull;</span>
                            <span>✉️ <a href="mailto:${escapeHtml(lead.email)}">${escapeHtml(lead.email)}</a></span>
                            ${igLink ? `<span>&bull;</span> <span>📸 ${igLink}</span>` : ''}
                        </div>
                        <div style="margin-top: 0.5rem;">
                            <span class="meta-tag">🎯 ${escapeHtml(lead.goal)}</span>
                            <span class="meta-tag">💼 ${escapeHtml(lead.occupation || 'Working Person')}</span>
                            <span class="meta-tag">⏰ ${escapeHtml(lead.workout_time || 'Flexible')}</span>
                            <span class="meta-tag">💰 ${escapeHtml(lead.budget || 'Flexible')}</span>
                            <span class="meta-tag">💳 ${escapeHtml(lead.payment_method || 'UPI')}</span>
                            <span class="meta-tag">📦 ${escapeHtml(lead.plan || 'Coaching')}</span>
                        </div>
                    </div>

                    ${(lead.struggles || lead.message) ? `
                        <div class="lead-message">
                            <strong>Struggles:</strong> "${escapeHtml(lead.struggles || lead.message)}"
                        </div>
                    ` : ''}
                    ${macroHtml}

                    <div class="lead-actions">
                        <a href="${waUrl}" target="_blank" class="btn-action-wa" title="Message on WhatsApp">
                            <span>💬 WhatsApp</span>
                        </a>

                        <select onchange="window.updateLeadStatus('${lead.id}', this.value)" title="Change Status">
                            <option value="new" ${lead.status === 'new' ? 'selected' : ''}>Status: New</option>
                            <option value="contacted" ${lead.status === 'contacted' ? 'selected' : ''}>Status: Contacted</option>
                            <option value="enrolled" ${lead.status === 'enrolled' ? 'selected' : ''}>Status: Enrolled</option>
                            <option value="archived" ${lead.status === 'archived' ? 'selected' : ''}>Status: Archived</option>
                        </select>

                        ${lead.status !== 'enrolled' ? `
                            <button onclick="window.enrollLead('${lead.id}')" class="admin-btn admin-btn-sm admin-btn-outline" style="color: var(--accent-green);" title="Confirm Enrollment & Deduct Slot">
                                ✓ Enroll & Deduct
                            </button>
                        ` : ''}

                        <button onclick="window.deleteLead('${lead.id}')" class="admin-btn admin-btn-sm" style="background: transparent; color: var(--accent-red); margin-left: auto;" title="Remove Lead">
                            🗑️
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Expose status update helpers to window
    window.updateLeadStatus = (id, newStatus) => {
        socket.emit('lead:update_status', { id, status: newStatus });
    };

    window.enrollLead = (id) => {
        socket.emit('lead:update_status', { id, status: 'enrolled' });
        socket.emit('slots:adjust', { delta: -1 });
        showAdminToast('Athlete enrolled! Coaching slot automatically deducted.');
    };

    window.deleteLead = (id) => {
        if (confirm('Are you sure you want to delete this consultation inquiry?')) {
            fetch(`/api/admin/leads/${id}`, {
                method: 'DELETE',
                headers: { 'x-admin-pin': coachPin }
            });
        }
    };

    // -------------------------------------------------------------
    // LIVE VISITOR CHAT
    // -------------------------------------------------------------
    function renderChatThreads() {
        chatThreadsCount.textContent = chatSessions.length;
        unreadChatsBadge.textContent = chatSessions.length;

        if (chatSessions.length === 0) {
            chatThreadsList.innerHTML = `
                <div style="padding: 1.5rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
                    No visitor conversations yet.
                </div>
            `;
            return;
        }

        chatThreadsList.innerHTML = chatSessions.map(session => {
            const isActive = activeChatSessionId === session.session_id;
            const timeStr = session.last_activity ? new Date(session.last_activity).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

            return `
                <div class="thread-item ${isActive ? 'active' : ''}" onclick="window.openChatSession('${session.session_id}', '${escapeHtml(session.sender_name || 'Visitor')}')">
                    <div class="thread-header">
                        <span class="thread-name">${escapeHtml(session.sender_name || 'Prospective Athlete')}</span>
                        <span class="thread-time">${timeStr}</span>
                    </div>
                    <div class="thread-preview">
                        ${session.last_sender === 'coach' ? '<span style="color: var(--primary-gold);">You: </span>' : ''}
                        ${escapeHtml(session.last_message || 'Started inquiry')}
                    </div>
                </div>
            `;
        }).join('');
    }

    window.openChatSession = (sessionId, name) => {
        activeChatSessionId = sessionId;
        socket.activeSession = sessionId;
        chatEmptyState.style.display = 'none';
        chatActiveWindow.style.display = 'flex';
        activeChatUser.textContent = name || 'Prospective Athlete';
        activeChatSessionSpan.textContent = `Session: #${sessionId.slice(0, 10)}`;

        renderChatThreads();

        // Join room and load history
        socket.emit('chat:join', { sessionId, senderName: 'Coach Kaarthi' });

        fetch(`/api/chat/${sessionId}`)
            .then(r => r.json())
            .then(data => {
                adminChatMessages.innerHTML = '';
                if (data.history) {
                    data.history.forEach(appendChatBubble);
                }
            });
    };

    function appendChatBubble(msg) {
        if (!adminChatMessages) return;
        const bubble = document.createElement('div');
        const isCoach = msg.sender === 'coach';
        bubble.className = `chat-bubble ${isCoach ? 'from-coach' : 'from-visitor'}`;
        const timeStr = new Date(msg.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        bubble.innerHTML = `
            <div>${escapeHtml(msg.text)}</div>
            <div class="chat-bubble-time">${timeStr}</div>
        `;

        adminChatMessages.appendChild(bubble);
        adminChatMessages.scrollTop = adminChatMessages.scrollHeight;
    }

    adminChatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = adminChatInput.value.trim();
        if (!text || !activeChatSessionId) return;

        socket.emit('chat:send', {
            sessionId: activeChatSessionId,
            sender: 'coach',
            text: text,
            senderName: 'Coach Kaarthi'
        });

        adminChatInput.value = '';
    });

    // Quick Chat Presets
    document.getElementById('btn-quick-macro-advice')?.addEventListener('click', () => {
        adminChatInput.value = "For muscle hypertrophy and clean bulking, aim for 1.8g - 2.2g of protein per kg of bodyweight, combined with a 250-350 calorie surplus. What is your current bodyweight?";
        adminChatInput.focus();
    });

    document.getElementById('btn-quick-program-advice')?.addEventListener('click', () => {
        adminChatInput.value = "Our Momentum 8-week program includes a fully tailored 5-day training split, weekly progressive overload adjustments, and 24/7 direct WhatsApp check-ins.";
        adminChatInput.focus();
    });

    // -------------------------------------------------------------
    // SETTINGS CONTROLLER
    // -------------------------------------------------------------
    settingsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const payload = {
            batch_name: settingBatchName.value,
            coach_status: settingCoachStatus.value,
            total_slots: parseInt(settingTotalSlots.value, 10),
            slots_remaining: parseInt(settingSlotsRemaining.value, 10)
        };

        if (settingAdminPin.value.trim().length >= 4) {
            payload.admin_pin = settingAdminPin.value.trim();
        }

        fetch('/api/admin/settings', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-pin': coachPin
            },
            body: JSON.stringify(payload)
        })
        .then(r => r.json())
        .then(res => {
            if (res.success) {
                settingsSaveNotification.textContent = '✓ Updated & Broadcast to Live Visitors!';
                if (payload.admin_pin) {
                    coachPin = payload.admin_pin;
                    sessionStorage.setItem('coach_pin', coachPin);
                }
                setTimeout(() => { settingsSaveNotification.textContent = ''; }, 3500);
            }
        });
    });

    // Helper: Toast
    function showAdminToast(msg) {
        const toast = document.createElement('div');
        toast.style.position = 'fixed';
        toast.style.bottom = '24px';
        toast.style.right = '24px';
        toast.style.background = '#1b1b26';
        toast.style.color = '#fff';
        toast.style.border = '1px solid var(--primary-gold)';
        toast.style.padding = '12px 20px';
        toast.style.borderRadius = '8px';
        toast.style.boxShadow = '0 10px 30px rgba(0,0,0,0.8)';
        toast.style.zIndex = '99999';
        toast.style.fontFamily = 'var(--font-body)';
        toast.style.fontSize = '0.9rem';
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => { toast.remove(); }, 5000);
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ---- Client Progress & Payments panel ----
    const progressClientSelect = document.getElementById('progress-client-select');
    const progressPanelBody = document.getElementById('progress-panel-body');
    const progressAddForm = document.getElementById('progress-add-form');
    const progressEntriesList = document.getElementById('progress-entries-list');
    const paymentsList = document.getElementById('payments-list');

    function populateProgressClientSelect() {
        if (!progressClientSelect) return;
        progressClientSelect.innerHTML = '<option value="">-- Select --</option>' +
            leads.map(l => `<option value="${l.id}">${escapeHtml(l.name)} (${l.ref_code})</option>`).join('');
    }

    async function loadClientProgressAndPayments(leadId) {
        const [pRes, payRes] = await Promise.all([
            fetch(`/api/admin/leads/${leadId}/progress`, { headers: { 'x-admin-pin': coachPin } }),
            fetch(`/api/admin/leads/${leadId}/payments`, { headers: { 'x-admin-pin': coachPin } })
        ]);
        const pData = await pRes.json();
        const payData = await payRes.json();

        progressEntriesList.innerHTML = (pData.progress || []).map(p => `
            <div class="lead-card" style="margin-bottom:8px;">
                <strong>${p.entry_date}</strong> ${p.weight ? '— ' + p.weight + 'kg' : ''}
                <p>${escapeHtml(p.note || '')}</p>
                <button class="admin-btn admin-btn-sm admin-btn-outline" data-del-progress="${p.id}">Delete</button>
            </div>`).join('') || '<p>No entries yet.</p>';

        paymentsList.innerHTML = (payData.payments || []).map(pay => `
            <div class="lead-card" style="margin-bottom:8px;">
                ₹${pay.amount} via ${escapeHtml(pay.method || '')} — <strong>${pay.status}</strong>
                ${pay.status === 'pending' ? `<button class="admin-btn admin-btn-sm admin-btn-gold" data-confirm-payment="${pay.id}">Confirm</button>` : ''}
            </div>`).join('') || '<p>No payments yet.</p>';

        progressEntriesList.querySelectorAll('[data-del-progress]').forEach(btn => {
            btn.addEventListener('click', async () => {
                await fetch(`/api/admin/progress/${btn.dataset.delProgress}`, { method: 'DELETE', headers: { 'x-admin-pin': coachPin } });
                loadClientProgressAndPayments(leadId);
            });
        });
        paymentsList.querySelectorAll('[data-confirm-payment]').forEach(btn => {
            btn.addEventListener('click', async () => {
                await fetch(`/api/admin/payments/${btn.dataset.confirmPayment}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'x-admin-pin': coachPin },
                    body: JSON.stringify({ status: 'confirmed' })
                });
                loadClientProgressAndPayments(leadId);
            });
        });
    }

    if (progressClientSelect) {
        progressClientSelect.addEventListener('change', () => {
            const id = progressClientSelect.value;
            progressPanelBody.style.display = id ? 'block' : 'none';
            if (id) loadClientProgressAndPayments(id);
        });
    }

    if (progressAddForm) {
        progressAddForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = progressClientSelect.value;
            if (!id) return;
            await fetch(`/api/admin/leads/${id}/progress`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-admin-pin': coachPin },
                body: JSON.stringify({
                    entry_date: document.getElementById('pg-date').value || undefined,
                    weight: document.getElementById('pg-weight').value || null,
                    photo_url: document.getElementById('pg-photo').value || null,
                    note: document.getElementById('pg-note').value || ''
                })
            });
            progressAddForm.reset();
            loadClientProgressAndPayments(id);
        });
    }

    const origRenderLeads = renderLeads;
    renderLeads = function (...args) {
        origRenderLeads.apply(this, args);
        populateProgressClientSelect();
    };
});
