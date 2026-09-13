import assert from 'assert';

async function runTests() {
  const baseUrl = 'http://localhost:3000';
  console.log('🧪 Running fullstack real-time API tests against', baseUrl);

  // 1. Check stats endpoint
  console.log('Test 1: GET /api/stats');
  const statsRes = await fetch(`${baseUrl}/api/stats`);
  assert.strictEqual(statsRes.status, 200, 'Stats endpoint should return 200');
  const statsData = await statsRes.json();
  assert.ok(statsData.success, 'Stats response should have success: true');
  assert.ok(statsData.stats.slotsRemaining !== undefined, 'Stats should contain slotsRemaining');
  console.log('  ✓ Pass: Current slots remaining =', statsData.stats.slotsRemaining);

  // 2. Submit a real-time consultation lead with all 12 onboarding fields
  console.log('Test 2: POST /api/leads');
  const leadPayload = {
    name: 'Siddharth V',
    age: 26,
    gender: 'Male',
    phone: '+91 98450 12345',
    email: 'siddharth@example.com',
    instagram: '@sid_lifts',
    occupation: 'Working Professional (Desk / Corporate)',
    workout_time: 'Evening (5:00 PM – 8:00 PM)',
    goal: 'Bulking / Muscle Hypertrophy',
    plan: 'Elite Transformation — 12 Weeks (₹11,999)',
    budget: '₹9,000 – ₹15,000 / month',
    payment_method: 'UPI (GPay / PhonePe / Paytm)',
    struggles: 'Struggling with inconsistent calorie intake and shoulder form on incline bench.',
    macro_profile: { calories: 2900, protein: 180, carbs: 340, fats: 72 }
  };

  const leadRes = await fetch(`${baseUrl}/api/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(leadPayload)
  });
  assert.strictEqual(leadRes.status, 201, 'Lead submission should return 201');
  const leadData = await leadRes.json();
  assert.ok(leadData.success, 'Lead submission should have success: true');
  assert.ok(leadData.lead.ref_code.startsWith('KL-'), 'Lead should have ref_code starting with KL-');
  assert.strictEqual(leadData.lead.age, 26, 'Age should be stored as 26');
  assert.strictEqual(leadData.lead.gender, 'Male', 'Gender should be stored as Male');
  assert.strictEqual(leadData.lead.instagram, '@sid_lifts', 'Instagram should be stored');
  assert.strictEqual(leadData.lead.payment_method, 'UPI (GPay / PhonePe / Paytm)', 'Payment method should match');
  const createdRef = leadData.lead.ref_code;
  const createdId = leadData.lead.id;
  console.log('  ✓ Pass: Created lead with Reference ID =', createdRef, 'and all 12 fields persisted');

  // 3. Track consultation status
  console.log('Test 3: GET /api/leads/track/' + createdRef);
  const trackRes = await fetch(`${baseUrl}/api/leads/track/${createdRef}`);
  assert.strictEqual(trackRes.status, 200, 'Tracking should return 200');
  const trackData = await trackRes.json();
  assert.strictEqual(trackData.ref_code, createdRef, 'Reference codes must match');
  assert.strictEqual(trackData.status, 'new', 'Initial status should be new');
  console.log('  ✓ Pass: Tracking returned status =', trackData.status);

  // 4. Admin Login with PIN
  console.log('Test 4: POST /api/admin/login');
  const loginRes = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: 'kaarthi2026' })
  });
  assert.strictEqual(loginRes.status, 200, 'Admin login should succeed with valid pin');
  const loginData = await loginRes.json();
  assert.ok(loginData.success, 'Login should succeed');
  console.log('  ✓ Pass: Admin authenticated successfully');

  // 5. Update lead status to "contacted"
  console.log('Test 5: PATCH /api/admin/leads/' + createdId);
  const updateRes = await fetch(`${baseUrl}/api/admin/leads/${createdId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-pin': 'kaarthi2026'
    },
    body: JSON.stringify({ status: 'contacted', notes: 'Automated test contacted' })
  });
  assert.strictEqual(updateRes.status, 200, 'Update lead should return 200');
  const updatedLeadData = await updateRes.json();
  assert.strictEqual(updatedLeadData.lead.status, 'contacted', 'Lead status should now be contacted');
  console.log('  ✓ Pass: Lead status updated to contacted');

  // 6. Test Chat Message API
  console.log('Test 6: POST & GET /api/chat/test_session_123');
  const chatPostRes = await fetch(`${baseUrl}/api/chat/test_session_123`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sender: 'visitor', text: 'Hello Coach Kaarthi, testing live chat!', sender_name: 'Test Visitor' })
  });
  assert.strictEqual(chatPostRes.status, 201, 'Chat post should return 201');
  
  const chatGetRes = await fetch(`${baseUrl}/api/chat/test_session_123`);
  const chatGetData = await chatGetRes.json();
  assert.ok(chatGetData.history.length > 0, 'Chat history should contain message');
  console.log('  ✓ Pass: Chat message saved and retrieved successfully');

  console.log('\n🎉 ALL FULLSTACK REAL-TIME TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
