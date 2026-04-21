UKL Railway App

1. Upload this folder to a GitHub repo.
2. In Railway, click New Project > Deploy from GitHub repo.
3. Select the repo.
4. After the service is created, add a Volume and mount it at /app/data.
5. Redeploy if needed.
6. Open the generated Railway domain.

Default login:
admin / 1234

Notes:
- The SQLite database lives in /app/data/ukl.db when using the volume.
- Excel uploads import State, District, Distributor Name, Mobile, Email from the first sheet.
