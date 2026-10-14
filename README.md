# basil-site

Personal site of Basil Pozdeev, live at https://sediadigital.com.
Static HTML/CSS/JS with three.js, no build step, served by GitHub Pages from `main` (repo root).

- `index.html`, `style.css`, `main.js`: the site (a floating-island city built on scroll)
- `CONTENT.md`: the facts the site draws on
- `CNAME`: custom domain for GitHub Pages
- `infra/`: Terraform for the DNS records in the Route53 zone
- Tag `drafts-v1-v6`: the six design drafts this one was chosen from

## Preview locally

```sh
python3 -m http.server 8080
# open http://localhost:8080
```

## DNS

`infra/` adds the GitHub Pages records to the existing `sediadigital.com` zone:
apex `A` and `AAAA` to GitHub Pages, and `www` as a `CNAME` to `vaspoz.github.io`.
It leaves the mail records (Proton, SES) alone. State is local and gitignored.

```sh
aws sso login --profile posterito-prod
cd infra
terraform init
terraform plan
terraform apply
```

Optional: verify the domain in GitHub (account settings → Pages → Add a domain), then apply
with `-var github_pages_verification=<value>` to create the `_github-pages-challenge` TXT record.
