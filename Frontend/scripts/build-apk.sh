#!/usr/bin/env bash
# Build one of the two Android apps (debug APK).
#   scripts/build-apk.sh parent            -> FutureSchool (parents), demo data on the phone
#   scripts/build-apk.sh staff             -> FutureSchool Administration (teachers, Principal, Admin)
#   scripts/build-apk.sh staff http://192.168.1.10:5000   -> uses that FutureSchool server
# Output: ../apk/FutureSchool-<variant>[-live].apk (relative to the repo root)
set -euo pipefail
variant="${1:?parent or staff}"
api="${2:-}"
cd "$(dirname "$0")/.."
if [ -n "$api" ]; then
  VITE_APP_VARIANT="$variant" VITE_BACKEND=api VITE_API_BASE_URL="$api" npm run build
  suffix="-live"
else
  VITE_APP_VARIANT="$variant" npm run build
  suffix=""
fi
npx cap sync android
flavor="$(tr '[:lower:]' '[:upper:]' <<< "${variant:0:1}")${variant:1}"
(cd android && ./gradlew "assemble${flavor}Debug" -q)
mkdir -p ../apk
cp "android/app/build/outputs/apk/$variant/debug/app-$variant-debug.apk" "../apk/FutureSchool-$variant$suffix.apk"
echo "Built ../apk/FutureSchool-$variant$suffix.apk"
