// MongoDB indexes để tối ưu hóa tìm kiếm người dùng
// Chạy script này một lần để tạo indexes

const { MongoClient } = require('mongodb');

async function createUserIndexes() {
  const client = new MongoClient(process.env.MONGODB_URI);
  
  try {
    await client.connect();
    const db = client.db();
    const usersCollection = db.collection('users');
    
    console.log('🔧 Creating MongoDB indexes for users collection...');
    
    // Index cho tìm kiếm theo username và email
    await usersCollection.createIndex(
      { username: 1, email: 1 },
      { 
        name: 'username_email_search',
        background: true 
      }
    );
    
    // Index cho tìm kiếm text (username và email)
    await usersCollection.createIndex(
      { 
        username: 'text', 
        email: 'text' 
      },
      { 
        name: 'text_search',
        background: true,
        weights: { username: 10, email: 5 } // Username có trọng số cao hơn
      }
    );
    
    // Index cho role
    await usersCollection.createIndex(
      { role: 1 },
      { 
        name: 'role_filter',
        background: true 
      }
    );
    
    // Index cho status.active
    await usersCollection.createIndex(
      { 'status.active': 1 },
      { 
        name: 'status_active_filter',
        background: true 
      }
    );
    
    // Index cho createdAt (đã có sẵn, nhưng đảm bảo nó tồn tại)
    await usersCollection.createIndex(
      { createdAt: -1 },
      { 
        name: 'createdAt_desc',
        background: true 
      }
    );
    
    // Compound index cho các filter thường dùng
    await usersCollection.createIndex(
      { 
        role: 1, 
        'status.active': 1, 
        createdAt: -1 
      },
      { 
        name: 'role_status_createdAt',
        background: true 
      }
    );
    
    // Compound index cho search + filters
    await usersCollection.createIndex(
      { 
        username: 1, 
        role: 1, 
        'status.active': 1, 
        createdAt: -1 
      },
      { 
        name: 'search_filters',
        background: true 
      }
    );
    
    console.log('✅ MongoDB indexes created successfully!');
    
    // Hiển thị danh sách indexes
    const indexes = await usersCollection.listIndexes().toArray();
    console.log('\n📋 Current indexes:');
    indexes.forEach(index => {
      console.log(`  - ${index.name}: ${JSON.stringify(index.key)}`);
    });
    
  } catch (error) {
    console.error('❌ Error creating indexes:', error);
  } finally {
    await client.close();
  }
}

// Chạy nếu được gọi trực tiếp
if (require.main === module) {
  createUserIndexes();
}

module.exports = { createUserIndexes };
