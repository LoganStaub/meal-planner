// Run with:  npm run user:role -- someone@example.com admin
//       or:  npm run user:role -- someone@example.com user
// Admins can add and edit the shared recipe and ingredient lists.
import { pool } from '../src/db.js'

const [email, role] = process.argv.slice(2)

if (!email || !['user', 'admin'].includes(role)) {
  console.error('Usage: npm run user:role -- <email> <user|admin>')
  process.exitCode = 1
} else {
  try {
    const { rows } = await pool.query(
      'update users set role = $2 where lower(email) = lower($1) returning user_id, email, role',
      [email.trim(), role]
    )
    if (rows.length === 0) {
      console.error(`❌ No user with email ${email}`)
      process.exitCode = 1
    } else {
      console.log(`✅ ${rows[0].email} (user ${rows[0].user_id}) is now: ${rows[0].role}`)
    }
  } catch (error) {
    console.error('❌ Could not update role:', error.message)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}
