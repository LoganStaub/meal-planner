// Sets a new password for someone who forgot theirs (there's no "Forgot
// password?" link, because the app doesn't send email).
//
// Run with:  npm run user:password -- someone@example.com
//
// It makes a random temporary password and prints it once. Send it to the
// person privately, and ask them to change it right away from the profile
// menu (Change password, /account/password). It also logs them out on
// every device and cancels any old reset link.
//
// The password is made here rather than typed on the command line, so it
// never ends up in anyone's shell history.
import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'
import { pool } from '../src/db.js'
import { redis } from '../src/redis.js'
import { SALT_ROUNDS, passwordError, endSessions, cancelResetLink } from '../src/routes/auth.js'

// 12 random bytes -> 16 letters, digits, - and _ (easy to copy and paste)
function temporaryPassword() {
  return randomBytes(12).toString('base64url')
}

const [email] = process.argv.slice(2)

if (!email || process.argv.length > 3) {
  console.error('Usage: npm run user:password -- <email>')
  process.exitCode = 1
} else {
  try {
    const password = temporaryPassword()
    const error = passwordError(password, password)
    if (error) throw new Error(error)

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
    const { rows } = await pool.query(
      `update users set password_hash = $2 where lower(email) = lower($1)
       returning user_id, email`,
      [email.trim(), passwordHash]
    )

    if (rows.length === 0) {
      console.error(`❌ No user with email ${email}`)
      process.exitCode = 1
    } else {
      const user = rows[0]
      await endSessions(user.user_id)
      await cancelResetLink(user.user_id)
      console.log(`✅ New password for ${user.email} (user ${user.user_id}):\n`)
      console.log(`   ${password}\n`)
      console.log('Send it to them privately and ask them to change it from the profile menu')
      console.log('(Change password). They have been logged out on every device.')
    }
  } catch (error) {
    console.error('❌ Could not set the password:', error.message)
    process.exitCode = 1
  } finally {
    await pool.end()
    await redis.quit()
  }
}
