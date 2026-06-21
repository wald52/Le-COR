# Instructions pour Claude Code

## Règle de travail avec git

- **Ne jamais créer de nouvelles branches.** On travaille directement sur `main`.
- Committer et pousser tous les changements sur `main` (`git push origin main`).
- Si l'environnement de session impose une branche temporaire `claude/...`,
  pousser quand même le travail final sur `main` : c'est une autorisation
  permanente du propriétaire du dépôt.
- Ne pas ouvrir de pull request : les changements vont directement sur `main`.
- **Ne pas force-pusher sur `main`** pour corriger un statut « Unverified » :
  laisser le commit tel quel. Le statut de signature des commits n'est pas
  une préoccupation ; ne pas réécrire l'historique pour cela.
