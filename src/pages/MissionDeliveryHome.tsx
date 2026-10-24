import { Link } from 'react-router-dom';
import { ArrowUpRight, ClipboardList, Car } from 'lucide-react';

export function MissionDeliveryHome() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-emerald-700">Mission Delivery</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">My Day</h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          A workspace for peer-support encounters, documentation and review.
        </p>
      </div>
      <section className="rounded-xl border border-emerald-200 bg-white p-6">
        <ClipboardList className="mb-4 h-7 w-7 text-emerald-700" aria-hidden="true" />
        <h2 className="text-xl font-semibold">Documentation workflow preview</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          The first workflow uses fictional encounters to explore SOAP notes and staff review.
          Service records continue in OneStep while the replacement is developed and accepted.
        </p>
        {import.meta.env.DEV ? (
          <a
            href="/demo.html"
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-medium text-white"
          >
            Open fictional workflow preview <ArrowUpRight className="h-4 w-4" />
          </a>
        ) : (
          <p className="mt-4 text-sm font-medium text-emerald-800">
            Preview under development. Service documentation is not enabled here.
          </p>
        )}
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <Car className="mb-3 h-6 w-6 text-slate-500" aria-hidden="true" />
        <h2 className="font-semibold">Operations</h2>
        <p className="mt-2 text-sm text-slate-600">
          Fleet, mileage, maintenance, expenses and reports remain available.
        </p>
        <Link
          to="/operations"
          className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-emerald-700"
        >
          Open fleet dashboard <ArrowUpRight className="h-4 w-4" />
        </Link>
      </section>
    </div>
  );
}
