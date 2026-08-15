type Props = {
  score: number;
  myVote: number;
  disabled?: boolean;
  onVote: (value: number) => void;
};

// clicking the same arrow twice sends 0 which removes the vote
export function Votes({ score, myVote, disabled, onVote }: Props) {
  return (
    <span className="votes">
      <button
        type="button"
        className={myVote === 1 ? 'on' : ''}
        disabled={disabled}
        aria-label="Votează pozitiv"
        onClick={() => onVote(myVote === 1 ? 0 : 1)}
      >
        ▲
      </button>
      <strong>{score}</strong>
      <button
        type="button"
        className={myVote === -1 ? 'on' : ''}
        disabled={disabled}
        aria-label="Votează negativ"
        onClick={() => onVote(myVote === -1 ? 0 : -1)}
      >
        ▼
      </button>
    </span>
  );
}
