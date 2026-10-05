// MongoDB Initialization Script for Kaizen Events
// This script runs automatically when the MongoDB container starts for the first time

print('Starting MongoDB initialization...');

// Switch to the application database
db = db.getSiblingDB('kaizen_events');

// Create collections with validation
print('Creating collections...');

// Users collection
db.createCollection('users', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['id', 'email', 'name', 'role', 'hashed_password'],
      properties: {
        id: { bsonType: 'string' },
        email: { bsonType: 'string' },
        name: { bsonType: 'string' },
        role: { enum: ['super_admin', 'org_admin', 'kiosk_volunteer'] },
        hashed_password: { bsonType: 'string' },
        is_active: { bsonType: 'bool' }
      }
    }
  }
});

// Campaigns collection
db.createCollection('campaigns');

// Registrations collection
db.createCollection('registrations');

// Payment accounts collection
db.createCollection('payment_accounts');

// Fund transfers collection
db.createCollection('fund_transfers');

// Audit logs collection
db.createCollection('audit_logs');

// Short URLs collection
db.createCollection('short_urls');

// Campaign members collection (for closed groups)
db.createCollection('campaign_members');

// Create indexes
print('Creating indexes...');

// Users indexes
db.users.createIndex({ 'id': 1 }, { unique: true });
db.users.createIndex({ 'email': 1 }, { unique: true });
db.users.createIndex({ 'role': 1 });

// Campaigns indexes
db.campaigns.createIndex({ 'id': 1 }, { unique: true });
db.campaigns.createIndex({ 'slug': 1 }, { unique: true });
db.campaigns.createIndex({ 'status': 1 });
db.campaigns.createIndex({ 'created_by': 1 });
db.campaigns.createIndex({ 'show_on_homepage': 1, 'status': 1 });

// Registrations indexes
db.registrations.createIndex({ 'id': 1 }, { unique: true });
db.registrations.createIndex({ 'campaign_id': 1 });
db.registrations.createIndex({ 'payment_status': 1 });
db.registrations.createIndex({ 'created_at': -1 });
db.registrations.createIndex({ 'campaign_id': 1, 'payment_status': 1 });

// Payment accounts indexes
db.payment_accounts.createIndex({ 'id': 1 }, { unique: true });
db.payment_accounts.createIndex({ 'gateway': 1 });

// Fund transfers indexes
db.fund_transfers.createIndex({ 'id': 1 }, { unique: true });
db.fund_transfers.createIndex({ 'campaign_id': 1 });
db.fund_transfers.createIndex({ 'status': 1 });

// Audit logs indexes - with TTL for 2-year retention
db.audit_logs.createIndex({ 'timestamp': 1 }, { expireAfterSeconds: 63072000 }); // 2 years
db.audit_logs.createIndex({ 'event_type': 1, 'timestamp': -1 });
db.audit_logs.createIndex({ 'user_id': 1, 'timestamp': -1 });
db.audit_logs.createIndex({ 'resource_type': 1, 'resource_id': 1 });

// Short URLs indexes
db.short_urls.createIndex({ 'short_code': 1 }, { unique: true });
db.short_urls.createIndex({ 'original_url': 1 });

// Campaign members indexes
db.campaign_members.createIndex({ 'campaign_id': 1, 'member_id': 1 }, { unique: true });
db.campaign_members.createIndex({ 'campaign_id': 1, 'phone': 1 });
db.campaign_members.createIndex({ 'campaign_id': 1, 'email': 1 });

print('MongoDB initialization completed successfully!');
print('Collections created: users, campaigns, registrations, payment_accounts, fund_transfers, audit_logs, short_urls, campaign_members');
