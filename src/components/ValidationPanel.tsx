import { ValidationIssue } from '../utils/validation';

interface Props {
  issues: ValidationIssue[];
}

export default function ValidationPanel({ issues }: Props) {
  if (issues.length === 0) {
    return <div className="validation ok">✅ 問題は見つかりませんでした。</div>;
  }
  return (
    <div className="validation">
      <ul>
        {issues.map((issue, i) => (
          <li key={i} className={issue.level}>
            {issue.level === 'error' ? '❌' : '⚠️'} {issue.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
