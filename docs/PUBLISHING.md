# Publish Fieldwave

The official repository and container are published at `hellatactical/fieldwave` and `ghcr.io/hellatactical/fieldwave:latest`. Both are public. To install the existing image, follow [the Unraid guide](UNRAID.md). The steps below are for maintaining this project or publishing your own fork.

1. Choose your GitHub account, repository name and visibility. Suggested name: `fieldwave`.
2. Run `node scripts/configure-repo.js YOUR-ACCOUNT fieldwave` from the project folder. This fills the container reference, Unraid template and documentation links. It does not contact GitHub.
3. Create an empty GitHub repository with that name (do not initialize another README). Upload/commit this project's contents, including `.github`, then push the `main` branch. Never include `.env`, `data` or `node_modules`.
4. Open **Actions → Test and publish container**. On `main`, passing checks lead to an AMD64 image build and publication as `ghcr.io/your-account/fieldwave:latest`. Tagged `v1.2.0` builds also publish `:1.2.0`; tags do not overwrite `latest`.
5. The workflow uses GitHub's built-in `GITHUB_TOKEN` with `packages: write`. No Discord token, panel password, or personal access token belongs in the build workflow.
6. For anonymous Unraid pulls, open the new package's **Package settings → Change visibility → Public**. A public source repository does not necessarily make its new package public. If you keep the package private, Unraid must authenticate to GHCR before pulling.
7. Verify `docker pull ghcr.io/your-account/fieldwave:latest` without registry credentials before advertising the public install.
8. Follow [UNRAID.md](UNRAID.md). Creating this repository does not automatically list Fieldwave in Unraid Community Applications; that is a separate submission.

GitHub CLI alternative after authenticating with `gh auth login`:

```bash
git init -b main
git add .
git commit -m "Introduce Fieldwave Discord bot and control panel"
gh repo create YOUR-ACCOUNT/fieldwave --public --source=. --remote=origin --push
```

Use `--private` instead if that is your chosen visibility. GitHub authentication is an interactive account step; do not put a token in a repository file.

GitHub handles dependency installation while building the image. Unraid downloads the finished image, including Node, FFmpeg, yt-dlp and the bot's Node packages. After a successful new build on `main`, use Unraid's **Check for Updates / Update** for the installed container.

References: [GitHub container publishing](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images), [GHCR visibility and authentication](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).
