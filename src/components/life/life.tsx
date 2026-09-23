'use client';
import { useCallback, useState } from 'react';
import { Growth } from '@/components/growth';
import { Checkin, Reflection } from '@/components/settings';
import { useViewProps } from '@/components/app/legacy';
import { Icon } from '@/components/icons';

// Life is deliberately secondary: workouts, food, a short check-in and the
// weekly reflection, kept light and never allowed to crowd out learning.
export function Life() {
  const [modal, setModal] = useState('');
  const open = useCallback((m: string) => setModal(m), []);
  const p = useViewProps(open);
  const checked = p.w.state.records.some((r) => r.id === 'checkin:' + p.today);
  return (
    <div className="page life legacy t-life">
      <header className="page-head">
        <div>
          <p className="eyebrow">Life</p>
          <h1 className="title">A few habits, kept simple.</h1>
        </div>
        <div className="row-inline">
          <button className="btn quiet" onClick={() => setModal('reflection')}>
            Weekly reflection
          </button>
          <button className={'btn ' + (checked ? 'quiet' : 'primary')} onClick={() => setModal('checkin')}>
            {checked ? <Icon name="check" size={17} /> : null}
            {checked ? 'Checked in' : 'Two-minute check-in'}
          </button>
        </div>
      </header>
      <Growth {...p} />
      {modal === 'checkin' && <Checkin {...p} close={() => setModal('')} />}
      {modal === 'reflection' && <Reflection {...p} close={() => setModal('')} />}
    </div>
  );
}
