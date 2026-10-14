# basil-site

Personal career site for Basil Pozdeev. Static HTML/CSS/JS, no build step.

- `index.html` — picker for the three drafts
- `v1/` Fleet, `v2/` Modules, `v3/` Lead time
- `CONTENT.md` — the facts every version uses; edit here first, then in each version

## Preview locally

```sh
python3 -m http.server 8080
# open http://localhost:8080
```

## Publish on GitHub Pages (later)

1. Create the GitHub repo and push `main`.
2. Repo Settings → Pages → Deploy from branch `main`, folder `/`.
3. Once a version is chosen, copy it to the root (or redirect `index.html` to it).
4. Custom domain: add a `CNAME` file with `sediadigital.com`, then in Route53 (zone `Z06094801U4NDVJOSDTT1`, account posterito-prod):
   - `A` apex → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `AAAA` apex → `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`
   - `CNAME` `www` → `vaspoz.github.io.`
   - Leave the Proton MX/TXT/DKIM and the SES records untouched.
5. Verify the domain in GitHub account settings → Pages, then tick "Enforce HTTPS".
