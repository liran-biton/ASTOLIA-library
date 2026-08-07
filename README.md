כניסה למערכת הפעילה בקישור הבא:
https://tinyurl.com/ASTOLIA

יוזרים כניסה למערכת
אדמין: David Popovich , סיסמא: 446699
עורך וידאו: Emily Carte , סיסמא: 444477
יוצר תוכן: Dora Onskates , סיסמא 223344 


# ASTOLIA library — מדריך הפעלה ושימוש

---

## 🇮🇱 עברית

### הפעלת המערכת (פעם אחת)

1. **גיליון Google Sheets** — צרו קובץ חדש עם 7 טאבים: `Users`, `Digital Creator`, `Spa Branches`, `Benefits`, `Partnerships`, `Library Content`, `Activity_Log`. הדביקו בכל אחד את שורת הכותרות המדויקת (מפורט ב-README).
2. **Apps Script** — בתוך הגיליון: **Extensions → Apps Script**. הדביקו את `Code.gs`, ואת שני קבצי ה-HTML (בשמות מדויקים **Index** ו-**JavaScript**).
3. **הרשאות** — הריצו פעם אחת פונקציה כלשהי שמשתמשת ב-Drive וב-`UrlFetchApp` (למשל דרך כפתור Run בעורך) ואשרו את כל ההרשאות המבוקשות (Drive + External requests).
4. **מפתח AI** — ב-**Project Settings → Script Properties** הוסיפו `ANTHROPIC_API_KEY` עם המפתח שלכם.
5. **Deploy** — **Deploy → New deployment** → Web app → Execute as: **Me** → Who has access: לפי הצורך → Deploy. העתיקו את ה-URL שמתקבל — זה כתובת האפליקציה.
6. **משתמש ראשון** — הוסיפו ידנית שורה בגיליון `Users` עם Role=`Admin` ו-Status=`Active`, כדי שתהיה לכם דרך כניסה ראשונה. את שאר המשתמשים אפשר להוסיף אחר כך דרך טאב Admin באפליקציה עצמה.

### כניסה לפי תפקיד

**יוצר תוכן (Content Creator)**
1. נכנסים עם Username (=Display Name) וסיסמה שקיבלתם מהאדמין
2. בטאב **Digital Creator** — לוחצים "+ Create Profile" וממלאים פרטים אישיים (שם, טלפון, עיר, קישורים לרשתות). ניתן ליצור פרופיל **אחד בלבד**
3. בטאב **My Experiences** רואים הצעות שת"פ חדשות (סטטוס Pending Approval) — לוחצים "Review & Approve", מסמנים 2 ההצהרות (ביצוע + בריאות), ומאשרים
4. אחרי אישור מופיע כפתור **Upload Content** — מעלים את כמות התמונות/הסרטונים הנדרשת
5. ליד כל פריט בחבילת התוכן (פוסט/ריילס/סטורי) מסמנים **Done** אחרי שפרסמו בפועל
6. לבסוף אפשר ללחוץ **Add Experience** ולשתף דירוג + חוויה כללית

**עורך וידאו (Video Editor)**
1. נכנסים עם Username וסיסמה
2. בטאב **Creator Partnerships** → תת-טאב **Spa Branches**: מוסיפים/עורכים סניפי ספא וסימון הפעילויות שיש בכל אחד
3. תת-טאב **Benefits Package**: מוסיפים סוגי הטבות ומשייכים כל אחת לפעילות מתאימה
4. תת-טאב **Partnerships**: "+ New Partnership" ליצירת שת"פ חדש עם יוצר תוכן, כולל דדליין ופרטי העלאה נדרשים. אפשר גם לערוך/לבטל שת"פים קיימים
5. בטאב **The Library** רואים את כל התוכן שהועלה עם ניתוח AI (סוג סצנה, איכות, מצב רוח, כיתוב מוצע)

**אדמין (Admin)**
- כל מה שיש לעורך וידאו, ובנוסף:
- טאב **Admin** — רואים את כל המשתמשים הרשומים, עורכים כל שדה שלהם (כולל סיסמה), ומוסיפים משתמשים חדשים עם כפתור "+ Add User" (סיסמה בת 6 ספרות)

---

## 🇬🇧 English

### First-time setup

1. **Google Sheet** — create a new spreadsheet with 7 tabs: `Users`, `Digital Creator`, `Spa Branches`, `Benefits`, `Partnerships`, `Library Content`, `Activity_Log`. Paste the exact header row into each (full details in README).
2. **Apps Script** — inside the sheet: **Extensions → Apps Script**. Paste `Code.gs`, plus the two HTML files (named exactly **Index** and **JavaScript**).
3. **Permissions** — run any function that uses Drive and `UrlFetchApp` once (e.g. via the Run button in the editor) and approve all requested permissions (Drive + External requests).
4. **AI key** — under **Project Settings → Script Properties**, add `ANTHROPIC_API_KEY` with your key.
5. **Deploy** — **Deploy → New deployment** → Web app → Execute as: **Me** → Who has access: as needed → Deploy. Copy the resulting URL — that's your app's address.
6. **First user** — manually add a row in the `Users` sheet with Role=`Admin` and Status=`Active`, so you have an initial way in. Every other user can then be added from the Admin tab inside the app itself.

### Logging in by role

**Content Creator**
1. Log in with the Username (=Display Name) and password given by the admin
2. In the **Digital Creator** tab — click "+ Create Profile" and fill in personal details (name, phone, city, social links). Only **one** profile is allowed
3. In **My Experiences**, new partnership proposals appear (Pending Approval status) — click "Review & Approve", check both declarations (agreement + health), and confirm
4. Once approved, an **Upload Content** button appears — upload the required number of photos/videos
5. Next to each item in the content package (post/reels/story), check **Done** once actually posted
6. Finally, click **Add Experience** to share a rating and a short write-up

**Video Editor**
1. Log in with Username and password
2. In **Creator Partnerships** → **Spa Branches** sub-tab: add/edit spa branches and mark which activities each one offers
3. **Benefits Package** sub-tab: add benefit types, each linked to a matching activity
4. **Partnerships** sub-tab: "+ New Partnership" to create a new deal with a content creator, including deadline and required upload counts. Existing partnerships can also be edited or cancelled
5. In **The Library**, view all uploaded content along with its AI analysis (scene type, quality, mood, suggested caption)

**Admin**
- Everything a Video Editor has, plus:
- **Admin** tab — view all registered users, edit any of their fields (including password), and add new users via "+ Add User" (6-digit password)
