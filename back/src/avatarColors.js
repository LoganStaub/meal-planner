// Colors a user can pick for their profile icon (Account settings on the home page).
// Each one is dark enough for the white initials on top to stay readable.
// users.avatar_color is null until someone picks one, which shows DEFAULT_AVATAR_COLOR.
export const DEFAULT_AVATAR_COLOR = '#d9531e'

export const AVATAR_COLORS = [
  { name: 'Orange', value: DEFAULT_AVATAR_COLOR },
  { name: 'Red', value: '#c0362c' },
  { name: 'Pink', value: '#c2185b' },
  { name: 'Purple', value: '#7b3fb0' },
  { name: 'Indigo', value: '#4053b5' },
  { name: 'Blue', value: '#1f6fb2' },
  { name: 'Teal', value: '#0f7c75' },
  { name: 'Green', value: '#2f7d32' },
  { name: 'Brown', value: '#8a5a3b' },
  { name: 'Slate', value: '#4b5563' },
]

export function isAvatarColor(value) {
  return AVATAR_COLORS.some((color) => color.value === value)
}
