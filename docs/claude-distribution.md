# Claude distribution

The repository offers a GitHub plugin marketplace and an independently uploadable skill ZIP. Both use the canonical skill under skills/context-gallery. The skill identifier is context-gallery, the plugin identifier is agent-unwrapped and the marketplace identifier is claude-unwrapped, and the initial version is 0.1.0.

## Current conventions

Claude's documented UI route for a skill ZIP is Customize → Skills → Create skill → Upload a skill. Code execution must be enabled. The skill folder and its metadata name must match. Package one skill folder at the ZIP root, with SKILL.md inside it. Claude's help article documents a 200-character description limit, so the package validates against that limit. The broader Agent Skills specification allows longer descriptions.

A GitHub marketplace uses a .claude-plugin/marketplace.json catalog. The plugin uses .claude-plugin/plugin.json and discovers skills in skills/. In Claude Desktop, users add a marketplace from Customize → Plugins and supply owner/repo or the repository URL. Marketplace updates can be checked manually and GitHub sources can enable automatic sync where available. A manually uploaded skill is updated by uploading a newer ZIP.

Cowork's shell runs in an isolated environment, with connected files and browser access mediated through Desktop. The artifact workflow creates downloadable, self-contained pages. The local workflow uses a loopback viewer when run directly on the user's computer. Account skills may sync into Claude Code v2.1.273+ when signed in with the same Claude account. Claude API skills have a separate upload/runtime path.

## Sources checked

- [Use skills in Claude](https://support.claude.com/en/articles/12512180-use-skills-in-claude)
- [Create custom skills](https://support.claude.com/en/articles/12512198-how-to-create-custom-skills)
- [Use plugins in Claude](https://support.claude.com/en/articles/13837440-use-plugins-in-claude)
- [Plugin structure](https://code.claude.com/docs/en/plugins-reference)
- [Marketplace structure](https://code.claude.com/docs/en/plugin-marketplaces)
- [Cowork execution](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork)
- [Account skill sync](https://code.claude.com/docs/en/skills)
- [Agent Skills specification](https://agentskills.io/specification)

## Release acceptance

Automated checks validate package contents and references, clean-folder import, missing and malformed exports, multipart import, read-only installation, standalone and local playback, screenshot failure handling, and a portrait video download in Chrome.

Before publishing a release, install the candidate ZIP in a live Claude Desktop account and install the plugin from GitHub. In each route, invoke the skill, check the missing-export instructions, provide an export, download the gallery, and open it in Chrome. Record the observed application version and outcome in the release notes. A draft release makes the candidate available for these checks. Publish after Desktop acceptance has been observed.
